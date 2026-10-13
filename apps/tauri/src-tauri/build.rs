fn main() {
    // tex.rs looks for dev sidecars named `<tool>-<target triple>` (Tauri's externalBin naming).
    println!(
        "cargo:rustc-env=SS_TARGET={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    tauri_build::build()
}
