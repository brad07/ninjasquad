// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(feature = "tauri-app")]
    sensai_lib::run();

    #[cfg(not(feature = "tauri-app"))]
    panic!("This binary requires the tauri-app feature to be enabled");
}