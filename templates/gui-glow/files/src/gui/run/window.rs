// ============================================================================
// Module:       @@module@@
// Description:  Feeds native input to egui and paints only when requested.
//
// Dependencies: winit, egui, egui-winit, egui_glow; super::graphics
// ============================================================================

//! One desktop window, its app, and its repaint deadline.

use super::Repaint;

use super::graphics::Graphics;
use crate::gui::app::App;
use std::time::Instant;
use winit::dpi::LogicalSize;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoopProxy};
use winit::window::Window;

/// Field order keeps the painter ahead of the native context and window.
pub(super) struct Running {
    app: App,
    painter: egui_glow::Painter,
    input: egui_winit::State,
    ctx: egui::Context,
    graphics: Graphics,
    next_repaint: Option<Instant>,
}

impl Running {
    /// Creates the window and a fallible painter, then builds the app once.
    pub(super) fn new(
        event_loop: &ActiveEventLoop,
        size: [f32; 2],
        proxy: EventLoopProxy<Repaint>,
        // @if config
        config: crate::config::Config,
        // @end
    ) -> anyhow::Result<Self> {
        let attributes = Window::default_attributes()
            .with_title(crate::NAME)
            .with_visible(false)
            .with_inner_size(LogicalSize::new(size[0], size[1]))
            .with_min_inner_size(LogicalSize::new(
                crate::gui::MIN_SIZE[0],
                crate::gui::MIN_SIZE[1],
            ));
        // @if brand
        let icon = crate::gui::icons::app_icon();
        let icon = winit::window::Icon::from_rgba(icon.rgba, icon.width, icon.height)?;
        let attributes = attributes.with_window_icon(Some(icon));
        // @end
        let graphics = Graphics::new(event_loop, attributes)?;
        let painter = egui_glow::Painter::new(graphics.gl(), "", None, true)
            .map_err(|error| anyhow::anyhow!("egui painter: {error}"))?;
        let ctx = egui::Context::default();
        ctx.set_request_repaint_callback(move |request| {
            if let Some(when) = Instant::now().checked_add(request.delay) {
                let _ = proxy.send_event(Repaint(when));
            }
        });
        let input = egui_winit::State::new(
            ctx.clone(),
            egui::ViewportId::ROOT,
            event_loop,
            Some(graphics.window().scale_factor() as f32),
            event_loop.system_theme(),
            Some(painter.max_texture_side()),
        );
        // @if config
        let app = App::new(&ctx, config);
        // @else
        let app = App::new(&ctx);
        // @end
        graphics.window().set_visible(true);
        graphics.window().request_redraw();
        Ok(Self {
            app,
            painter,
            input,
            ctx,
            graphics,
            next_repaint: None,
        })
    }

    /// The native window.
    pub(super) fn window(&self) -> &Window {
        self.graphics.window()
    }

    /// Keep the earliest outstanding request.
    pub(super) fn request_repaint(&mut self, when: Instant) {
        self.next_repaint = Some(self.next_repaint.map_or(when, |old| old.min(when)));
    }

    /// Sleep until input or the next egui animation/timer frame.
    pub(super) fn schedule(&mut self) -> ControlFlow {
        let Some(when) = self.next_repaint else {
            return ControlFlow::Wait;
        };
        if when <= Instant::now() {
            self.next_repaint = None;
            self.window().request_redraw();
            ControlFlow::Wait
        } else {
            ControlFlow::WaitUntil(when)
        }
    }

    /// Returns true when the native window or the app asks to quit.
    pub(super) fn event(&mut self, event: WindowEvent) -> anyhow::Result<bool> {
        let response = self.input.on_window_event(self.graphics.window(), &event);
        if response.repaint {
            self.window().request_redraw();
        }
        // Other native events have already been delivered to egui above.
        #[expect(
            clippy::wildcard_enum_match_arm,
            reason = "egui handles remaining window events"
        )]
        match event {
            WindowEvent::CloseRequested | WindowEvent::Destroyed => return Ok(true),
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                self.graphics.resize();
                self.window().request_redraw();
            }
            WindowEvent::RedrawRequested => return self.draw(),
            _ => {}
        }
        Ok(false)
    }

    /// Runs the app inside run_pass, applies native commands, and presents.
    fn draw(&mut self) -> anyhow::Result<bool> {
        let size = self.window().inner_size();
        if size.width == 0 || size.height == 0 || self.window().is_minimized() == Some(true) {
            self.next_repaint = None;
            return Ok(false);
        }
        self.next_repaint = None;
        let info = self
            .input
            .egui_input_mut()
            .viewports
            .entry(egui::ViewportId::ROOT)
            .or_default();
        egui_winit::update_viewport_info(
            info,
            &self.ctx,
            self.graphics.window(),
            self.ctx.cumulative_pass_nr() == 0,
        );
        let input = self.input.take_egui_input(self.graphics.window());
        let mut output = self.ctx.run_pass(input, |ctx| self.app.ui(ctx));
        self.input
            .handle_platform_output(self.graphics.window(), output.platform_output);
        let mut close = false;
        if let Some(viewport) = output.viewport_output.remove(&egui::ViewportId::ROOT) {
            self.next_repaint = Instant::now().checked_add(viewport.repaint_delay);
            close = viewport
                .commands
                .iter()
                .any(|command| matches!(command, egui::ViewportCommand::Close));
            egui_winit::process_viewport_commands(
                &self.ctx,
                &mut egui::ViewportInfo::default(),
                viewport.commands,
                self.graphics.window(),
                &mut Vec::new(),
            );
        }
        for (id, deltas) in output.textures_delta.set.drain() {
            for delta in deltas {
                self.painter.set_texture(id, &delta);
            }
        }
        let primitives = self.ctx.tessellate(output.shapes, output.pixels_per_point);
        self.painter.clear(size.into(), self.app.clear_color());
        self.painter
            .paint_primitives(size.into(), output.pixels_per_point, &primitives);
        for id in output.textures_delta.free.drain() {
            self.painter.free_texture(id);
        }
        self.graphics.present()?;
        Ok(close)
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        self.app.on_exit();
        self.painter.destroy();
    }
}
