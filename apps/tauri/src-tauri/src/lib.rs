mod ai;
mod api;
mod config;
mod error;
mod fsutil;
mod library;
mod server;
mod storage;
mod tex;
mod zipio;

use api::ApiState;
use library::Library;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, webview::DownloadEvent};
use tex::TexTools;

/// Where the library lives and why (see `library::resolve_root` for the order). Asks the OS where
/// its known folders are but touches no folder. `SOMESCRIPT_DOCUMENTS_DIR` stands in for the OS's
/// Documents folder (tests, portable use).
fn locate_library(app: &tauri::App, config_path: Option<&Path>) -> library::Resolved {
    let paths = app.path();
    library::resolve_root(
        std::env::var_os("SOMESCRIPT_LIBRARY").map(PathBuf::from),
        config_path.and_then(|p| config::load(p).library_path),
        std::env::var_os("SOMESCRIPT_DOCUMENTS_DIR")
            .map(PathBuf::from)
            .or_else(|| paths.document_dir().ok()),
        paths.home_dir().ok(),
        paths.app_local_data_dir().ok(),
    )
}

/// A rotating `somescript.log` in the OS log folder. A release build on Windows has no console
/// (`windows_subsystem = "windows"`), so without a file nothing it says is ever seen.
///
/// Added from `setup`, not on the builder: a plugin that fails to start (a log folder that can't be
/// made) would stop the whole app, and missing logs must never cost the user their editor.
fn logging<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
                file_name: Some("somescript".into()),
            }),
        ])
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .build()
}

/// Release builds are `panic = "abort"` with no console, so a panic would otherwise end the app
/// without a trace. The hook writes it to the log first.
fn log_panics() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        log::logger().flush();
        previous(info);
    }));
}

/// Bundled templates: the app's resource dir. Under `cargo run` there is no bundle, so debug
/// builds read the source tree; a release build never does (a missing bundle must fail loudly,
/// not read whatever happens to exist at the build machine's path).
fn templates_dir(app: &tauri::App) -> PathBuf {
    let bundled = app.path().resource_dir().ok().map(|d| d.join("templates"));
    match bundled {
        Some(dir) if dir.is_dir() || !cfg!(debug_assertions) => dir,
        _ => Path::new(env!("CARGO_MANIFEST_DIR")).join("templates"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Automated checks (CI smoke tests of a built bundle) drive the HTTP surface only, so
    // SOMESCRIPT_HEADLESS runs the server with no window and no Dock icon.
    let headless = std::env::var_os("SOMESCRIPT_HEADLESS").is_some();
    log_panics();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if let Err(e) = app.handle().plugin(logging()) {
                eprintln!("[log] no log file: {e}");
            }
            let config_path = app
                .path()
                .app_config_dir()
                .ok()
                .map(|d| d.join("config.json"));
            let located = locate_library(app, config_path.as_deref());
            log::info!(
                "SomeScript {} starting; library {} ({:?}), default {}",
                env!("CARGO_PKG_VERSION"),
                located.root.display(),
                located.source,
                located.default.display()
            );
            // Nothing is created or read here. The folder may be in a place the OS protects
            // (Documents), and asking for it before the first-run screen has explained why is both
            // confusing and the reason a refused prompt used to leave the app without a library.
            // The first-run screen, the Library screen or creating a project makes it, and reports
            // the real reason if that fails.
            let library = Arc::new(Library::with_source(located.root, located.source));

            // AI settings live beside config.json in the app config dir, never in a project.
            let ai_path = app.path().app_config_dir().ok().map(|d| d.join("ai.json"));
            let state = ApiState {
                library,
                tex: Arc::new(TexTools::locate(app.path().resource_dir().ok().as_deref())),
                templates_dir: templates_dir(app),
                config_path,
                default_library: located.default,
                alternatives: library::alternative_places(
                    app.path().home_dir().ok().as_deref(),
                    app.path().app_local_data_dir().ok().as_deref(),
                ),
                log_dir: app.path().app_log_dir().ok(),
                webview_version: tauri::webview_version().ok(),
                ai: Arc::new(ai::settings::AiStore::load(ai_path)),
                http: ai::AiHttp::new(),
            };
            let started =
                tauri::async_runtime::block_on(server::start(app.handle().clone(), state))?;
            if headless {
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                return Ok(());
            }
            let served = format!(
                "http://127.0.0.1:{}/{}",
                started.port,
                started.token.map(|t| format!("?t={t}")).unwrap_or_default()
            );
            // `tauri dev` sets devUrl (Vite, which proxies /api to us); otherwise load our server.
            let url = match (cfg!(debug_assertions), app.config().build.dev_url.clone()) {
                (true, Some(dev)) => dev,
                _ => served.parse()?,
            };
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("SomeScript")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                // The editor downloads via <a download>; the webview drops these unless allowed.
                // They land in ~/Downloads (verified in the M0 spike). Tell the page when one is
                // done, since the webview shows no download UI of its own.
                .on_download({
                    let requested: Mutex<Option<PathBuf>> = Mutex::new(None);
                    move |webview, event| {
                        match event {
                            DownloadEvent::Requested { destination, .. } => {
                                *requested.lock().unwrap_or_else(|e| e.into_inner()) =
                                    Some(destination.clone());
                            }
                            DownloadEvent::Finished { path, success, .. } => {
                                // macOS reports no path on Finished, so use the requested one.
                                let path = path.or_else(|| {
                                    requested.lock().unwrap_or_else(|e| e.into_inner()).take()
                                });
                                let _ = webview.emit(
                                    "somescript-download",
                                    serde_json::json!({ "path": path, "success": success }),
                                );
                            }
                            _ => {}
                        }
                        true
                    }
                });
            // Windows hands file drops to the window itself unless told not to, and then the page's own
            // drag-and-drop never fires: the file tree's drag-to-move and drop-to-upload would do
            // nothing. (Elsewhere the webview delivers them to the page already.)
            #[cfg(windows)]
            let window = window.disable_drag_drop_handler();
            window.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            // With no window Tauri would exit at once; headless mode keeps serving.
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = event
                && headless
            {
                api.prevent_exit();
            }
        });
}
