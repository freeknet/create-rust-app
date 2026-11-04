// ============================================================================
// Module:       @@module@@
// Description:  The window runtime: opens the window with eframe on wgpu and
//               drives the app until it closes.
//
// Dependencies: eframe (window, event loop, wgpu renderer), anyhow;
//               super::app::App
// ============================================================================

//! The runtime.
//!
//! The only file in the crate that names eframe. [`run`] opens the window
//! and hands each frame to [`App`](super::app::App), which uses egui alone.
//!
//! ## eframe on wgpu, not glow
//!
//! eframe's glow path goes through WGL on Windows, which fails on machines
//! with a stale or hybrid OpenGL driver — common on switchable-graphics
//! laptops. wgpu talks to D3D12 instead, and on Windows it is pinned to
//! D3D12 alone ([`backends`]): leaving Vulkan in the set lets wgpu pick a
//! vendor ICD, which is the same class of driver the switch away from GL was
//! made to avoid. `WGPU_BACKEND` still overrides it.

use super::app::App;

/// Hands eframe's per-frame callbacks to the app.
struct Shell {
    /// The app being driven.
    app: App,
}

impl eframe::App for Shell {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.app.show(ui);
    }

    fn on_exit(&mut self) {
        self.app.on_exit();
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        // The theme's own background, so a resize never flashes white.
        self.app.clear_color()
    }
}

/// The graphics backends the window may be created on.
///
/// D3D12 alone on Windows, unless `WGPU_BACKEND` names something. An empty
/// or misspelled override names *no* backend, so wgpu would find no
/// adapter and the window would silently not open; that is refused too.
fn backends() -> eframe::wgpu::Backends {
    match eframe::wgpu::Backends::from_env() {
        Some(chosen) if !chosen.is_empty() => chosen,
        _ if cfg!(windows) => eframe::wgpu::Backends::DX12,
        _ => eframe::wgpu::Backends::PRIMARY,
    }
}

/// Opens the window and runs until it closes.
///
/// # Errors
///
/// When the window or its renderer cannot be created.
// @if config
pub fn run(config: crate::config::Config) -> anyhow::Result<()> {
    let size = config.window_size.unwrap_or(super::DEFAULT_SIZE);
    // @else
pub fn run() -> anyhow::Result<()> {
    let size = super::DEFAULT_SIZE;
    // @end
    let viewport = egui::ViewportBuilder::default()
        .with_title(crate::NAME)
        .with_app_id(crate::APP_ID)
        .with_inner_size(size)
        // @if brand
        .with_icon(super::icons::app_icon())
        // @end
        .with_min_inner_size(super::MIN_SIZE);

    // Only the backend set is ours; the rest of the wgpu setup stays
    // eframe's default, mutated in place rather than restated.
    let mut wgpu_options = eframe::WgpuConfiguration::default();
    if let eframe::egui_wgpu::WgpuSetup::CreateNew(setup) = &mut wgpu_options.wgpu_setup {
        setup.instance_descriptor.backends = backends();
    }

    let options = eframe::NativeOptions {
        viewport,
        renderer: eframe::Renderer::Wgpu,
        wgpu_options,
        // The app keeps its own size in the config; eframe's separate
        // window persistence could restore a position on a detached monitor.
        persist_window: false,
        ..Default::default()
    };

    eframe::run_native(
        crate::NAME,
        options,
        Box::new(move |cc| {
            // @if config
            let app = App::new(&cc.egui_ctx, config);
            // @else
            let app = App::new(&cc.egui_ctx);
            // @end
            Ok(Box::new(Shell { app }))
        }),
    )
    .map_err(|error| anyhow::anyhow!("the window could not be opened: {error}"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_backend_override_that_names_nothing_is_refused() {
        // `from_comma_list` maps an unrecognised name to the empty set; the
        // guard in `backends` exists because of exactly that.
        assert!(eframe::wgpu::Backends::from_comma_list("d3d").is_empty());
        if std::env::var_os("WGPU_BACKEND").is_none() {
            assert!(!super::backends().is_empty(), "no backend to pick from");
        }
    }
}
