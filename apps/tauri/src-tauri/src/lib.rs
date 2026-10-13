mod api;
mod error;
mod library;
mod server;
mod storage;
mod tex;

use api::ApiState;
use library::Library;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, webview::DownloadEvent};
use tex::TexTools;

/// `SOMESCRIPT_LIBRARY` (dev, tests, portable use) overrides the default `~/Documents/SomeScript`.
fn library_root(app: &tauri::App) -> PathBuf {
    std::env::var_os("SOMESCRIPT_LIBRARY")
        .map(PathBuf::from)
        .or_else(|| app.path().document_dir().ok().map(|d| d.join("SomeScript")))
        .unwrap_or_else(|| PathBuf::from("SomeScript"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = library_root(app);
            // An unusable folder (unplugged drive, moved) must not stop the app from starting:
            // the Library screen reports it and lets the user pick another one.
            if let Err(e) = std::fs::create_dir_all(&root) {
                eprintln!("[library] can't use {}: {e}", root.display());
            }
            let library = Arc::new(Library::new(root));

            let state = ApiState {
                library,
                tex: Arc::new(TexTools::locate()),
            };
            let started =
                tauri::async_runtime::block_on(server::start(app.handle().clone(), state))?;
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
