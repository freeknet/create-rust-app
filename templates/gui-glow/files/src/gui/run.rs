// ============================================================================
// Module:       @@module@@
// Description:  Opens a native OpenGL window and drives the egui app on demand.
//
// Dependencies: winit, egui; app::App; run::{graphics, window}
// ============================================================================

//! The winit + glutin + egui_glow runtime.
//!
//! Input and egui repaint deadlines wake the loop; an idle window sleeps.
//! GL setup and ownership stay in private children of this module.

mod graphics;
mod window;

use std::time::Instant;
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::WindowId;

/// A repaint requested by egui, including requests from another thread.
struct Repaint(Instant);

/// The event-loop state, before and after the window exists.
struct Shell {
    running: Option<window::Running>,
    failure: Option<anyhow::Error>,
    size: [f32; 2],
    proxy: winit::event_loop::EventLoopProxy<Repaint>,
    // @if config
    config: Option<crate::config::Config>,
    // @end
}

impl Shell {
    /// Persist the app and release GL resources before the loop returns.
    fn shutdown(&mut self) {
        // Running's Drop destroys the painter while its context is current.
        self.running.take();
    }
}

impl ApplicationHandler<Repaint> for Shell {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.running.is_some() || self.failure.is_some() {
            return;
        }
        // @if config
        let config = self.config.take().unwrap_or_default();
        let running = window::Running::new(event_loop, self.size, self.proxy.clone(), config);
        // @else
        let running = window::Running::new(event_loop, self.size, self.proxy.clone());
        // @end
        match running {
            Ok(running) => self.running = Some(running),
            Err(error) => {
                self.failure = Some(error);
                event_loop.exit();
            }
        }
    }

    fn user_event(&mut self, _event_loop: &ActiveEventLoop, Repaint(when): Repaint) {
        if let Some(running) = &mut self.running {
            running.request_repaint(when);
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, id: WindowId, event: WindowEvent) {
        let Some(running) = &mut self.running else {
            return;
        };
        if running.window().id() != id {
            return;
        }
        match running.event(event) {
            Ok(true) => event_loop.exit(),
            Ok(false) => {}
            Err(error) => {
                self.failure = Some(error);
                event_loop.exit();
            }
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        let flow = self
            .running
            .as_mut()
            .map_or(ControlFlow::Wait, window::Running::schedule);
        event_loop.set_control_flow(flow);
    }

    fn exiting(&mut self, _event_loop: &ActiveEventLoop) {
        self.shutdown();
    }
}

/// Opens the window and runs until it closes.
///
/// # Errors
///
/// Returns window, OpenGL setup, or presentation failures.
// @if config
pub fn run(config: crate::config::Config) -> anyhow::Result<()> {
    let size = config.window_size.unwrap_or(super::DEFAULT_SIZE);
    // @else
pub fn run() -> anyhow::Result<()> {
    let size = super::DEFAULT_SIZE;
    // @end
    let event_loop = EventLoop::<Repaint>::with_user_event().build()?;
    let mut shell = Shell {
        running: None,
        failure: None,
        size,
        proxy: event_loop.create_proxy(),
        // @if config
        config: Some(config),
        // @end
    };
    let result = event_loop.run_app(&mut shell);
    shell.shutdown();
    result?;
    match shell.failure {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
