// ============================================================================
// Module:       @@module@@
// Description:  Renders every page of the app headlessly to PNG files, for the
//               README and for reviewing a visual change.
//
// Dependencies: egui_kittest (headless harness + wgpu renderer), anyhow;
//               @@appCrateSnake@@::gui::app
// ============================================================================

//! `cargo run --example screenshot [-- <out dir>]`
//!
//! Drives the real [`App`] in egui_kittest's headless harness, the same way
//! a window runtime would, and renders each page with wgpu. The default
//! output directory is under `target/`: these are build output, regenerated
//! on demand, and a directory of stale committed PNGs is what makes someone
//! trust a picture that is three changes out of date.

use @@appCrateSnake@@::gui::app::{Action, App, Page};

fn main() -> anyhow::Result<()> {
    let out = std::env::args().nth(1).map_or_else(
        || {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("target")
                .join("screenshots")
        },
        std::path::PathBuf::from,
    );
    std::fs::create_dir_all(&out)?;
    let [width, height] = @@appCrateSnake@@::gui::DEFAULT_SIZE;
    for page in Page::ALL {
        let mut harness = egui_kittest::Harness::builder()
            .with_size(egui::vec2(width, height))
            .build_ui_state(
                |ui, app: &mut Option<App>| {
                    let app = app.get_or_insert_with(|| {
                        // @if config
                        let mut app = App::new(ui.ctx(), @@appCrateSnake@@::config::Config::default());
                        // @else
                        let mut app = App::new(ui.ctx());
                        // @end
                        app.apply(ui.ctx(), Action::Go(page));
                        app
                    });
                    app.show(ui);
                },
                None,
            );
        // Long enough for the page's arrival animation to finish.
        harness.run_steps(60);
        let image = harness
            .render()
            .map_err(|error| anyhow::anyhow!("rendering {page:?} failed: {error}"))?;
        let path = out.join(format!("{}.png", page.key()));
        image.save(&path)?;
        println!("wrote {}", path.display());
    }
    Ok(())
}
