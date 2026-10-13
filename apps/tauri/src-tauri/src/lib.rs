mod api;
mod config;
mod error;
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
    time::SystemTime,
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, webview::DownloadEvent};
use tex::TexTools;

/// `SOMESCRIPT_LIBRARY` (dev, tests, portable use) beats the folder saved in the app config,
/// which beats the default `~/Documents/SomeScript`.
fn library_root(app: &tauri::App, config_path: Option<&Path>) -> PathBuf {
    std::env::var_os("SOMESCRIPT_LIBRARY")
        .map(PathBuf::from)
        .or_else(|| config_path.and_then(|p| config::load(p).library_path))
        .or_else(|| app.path().document_dir().ok().map(|d| d.join("SomeScript")))
        .unwrap_or_else(|| PathBuf::from("SomeScript"))
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let config_path = app
                .path()
                .app_config_dir()
                .ok()
                .map(|d| d.join("config.json"));
            let root = library_root(app, config_path.as_deref());
            // An unusable folder (unplugged drive, moved) must not stop the app from starting:
            // the Library screen reports it and lets the user pick another one.
            if let Err(e) = std::fs::create_dir_all(&root) {
                eprintln!("[library] can't use {}: {e}", root.display());
            }
            let library = Arc::new(Library::new(root));
            library.purge_expired(SystemTime::now());

            let state = ApiState {
                library,
                tex: Arc::new(TexTools::locate(app.path().resource_dir().ok().as_deref())),
                templates_dir: templates_dir(app),
                config_path,
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
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
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
                })
                .build()?;
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
