// ============================================================================
// Module:       @@module@@
// Description:  Owns the native GL context, surface, window and function loader.
//
// Dependencies: glutin, glutin-winit, glow, raw-window-handle, winit
// ============================================================================

//! The GL boundary. Each private safe leaf performs one native operation.
//!
//! The event loop outlives this owner. The context stays current on its
//! creating thread; the surface and context are dropped before the window.

use glutin::config::{Config, ConfigTemplate, ConfigTemplateBuilder, GlConfig};
use glutin::context::{
    ContextApi, ContextAttributes, ContextAttributesBuilder, GlProfile, NotCurrentContext,
    NotCurrentGlContext, PossiblyCurrentContext, Version,
};
use glutin::display::{Display, DisplayApiPreference, GlDisplay};
use glutin::surface::{
    GlSurface, Surface, SurfaceAttributes, SurfaceAttributesBuilder, SwapInterval, WindowSurface,
};
use raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle};
use std::num::NonZeroU32;
use std::sync::Arc;
use winit::event_loop::ActiveEventLoop;
use winit::window::{Window, WindowAttributes};

/// Resources are declared in native destruction order.
pub(super) struct Graphics {
    gl: Arc<glow::Context>,
    surface: Surface<WindowSurface>,
    context: PossiblyCurrentContext,
    window: Window,
    _display: Display,
}

impl Graphics {
    /// Opens a desktop GL 3.3 context and enables vsync.
    pub(super) fn new(
        event_loop: &ActiveEventLoop,
        attributes: WindowAttributes,
    ) -> anyhow::Result<Self> {
        // WGL needs a real window before querying its pixel formats. Other
        // platforms finalise the window after selecting a matching visual.
        let early = if cfg!(target_os = "windows") {
            Some(event_loop.create_window(attributes.clone())?)
        } else {
            None
        };
        let early_handle = early
            .as_ref()
            .map(|window| window.window_handle().map(|handle| handle.as_raw()))
            .transpose()?;
        let display = new_display(
            event_loop.display_handle()?.as_raw(),
            preference(early_handle),
        )?;
        let mut template = ConfigTemplateBuilder::new()
            .with_alpha_size(8)
            .with_depth_size(0)
            .with_stencil_size(0);
        if let Some(handle) = early_handle {
            template = template.compatible_with_native_window(handle);
        }
        let config = find_config(&display, template.build())?;
        let window = match early {
            Some(window) => window,
            None => glutin_winit::finalize_window(event_loop, attributes, &config)?,
        };
        let handle = window.window_handle()?.as_raw();
        let attributes = ContextAttributesBuilder::new()
            .with_context_api(ContextApi::OpenGl(Some(Version::new(3, 3))))
            .with_profile(GlProfile::Core)
            .build(Some(handle));
        let context = create_context(&display, &config, &attributes)?;
        let size = window.inner_size();
        let attributes = SurfaceAttributesBuilder::<WindowSurface>::new().build(
            handle,
            NonZeroU32::new(size.width).unwrap_or(NonZeroU32::MIN),
            NonZeroU32::new(size.height).unwrap_or(NonZeroU32::MIN),
        );
        let surface = create_surface(&display, &config, &attributes)?;
        let context = context.make_current(&surface)?;
        surface.set_swap_interval(&context, SwapInterval::Wait(NonZeroU32::MIN))?;
        let gl = Arc::new(load_gl(&display));
        Ok(Self {
            gl,
            surface,
            context,
            window,
            _display: display,
        })
    }

    /// The live native window, kept until after its surface and context.
    pub(super) fn window(&self) -> &Window {
        &self.window
    }

    /// Functions for the context currently bound to this thread.
    pub(super) fn gl(&self) -> Arc<glow::Context> {
        Arc::clone(&self.gl)
    }

    /// Minimised windows retain their last nonzero surface dimensions.
    pub(super) fn resize(&self) {
        let size = self.window.inner_size();
        if let (Some(width), Some(height)) =
            (NonZeroU32::new(size.width), NonZeroU32::new(size.height))
        {
            self.surface.resize(&self.context, width, height);
        }
    }

    /// Presents a frame, paced by the surface's swap interval.
    pub(super) fn present(&self) -> anyhow::Result<()> {
        self.surface.swap_buffers(&self.context)?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn preference(window: Option<RawWindowHandle>) -> DisplayApiPreference {
    DisplayApiPreference::Wgl(window)
}

#[cfg(target_os = "macos")]
fn preference(_window: Option<RawWindowHandle>) -> DisplayApiPreference {
    DisplayApiPreference::Cgl
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn preference(_window: Option<RawWindowHandle>) -> DisplayApiPreference {
    DisplayApiPreference::GlxThenEgl(Box::new(winit::platform::x11::register_xlib_error_hook))
}

fn new_display(
    handle: RawDisplayHandle,
    preference: DisplayApiPreference,
) -> anyhow::Result<Display> {
    // SAFETY: the handle is borrowed from the live event loop; Shell drops
    // Graphics in exiting (or before run returns), while that loop lives.
    Ok(unsafe { Display::new(handle, preference) }?)
}

fn find_config(display: &Display, template: ConfigTemplate) -> anyhow::Result<Config> {
    // SAFETY: the template's optional native handle belongs to the early
    // WGL window, which remains alive throughout this query.
    let configs = unsafe { display.find_configs(template) }?;
    configs
        .min_by_key(|config| (!config.hardware_accelerated(), config.num_samples()))
        .ok_or_else(|| anyhow::anyhow!("no matching OpenGL framebuffer configuration"))
}

fn create_context(
    display: &Display,
    config: &Config,
    attributes: &ContextAttributes,
) -> anyhow::Result<NotCurrentContext> {
    // SAFETY: config came from display; the attributes refer to our live
    // window, which Graphics keeps until after the context is dropped.
    Ok(unsafe { display.create_context(config, attributes) }?)
}

fn create_surface(
    display: &Display,
    config: &Config,
    attributes: &SurfaceAttributes<WindowSurface>,
) -> anyhow::Result<Surface<WindowSurface>> {
    // SAFETY: config belongs to display and attributes refer to our live
    // window. Graphics drops the surface before dropping that window.
    Ok(unsafe { display.create_window_surface(config, attributes) }?)
}

fn load_gl(display: &Display) -> glow::Context {
    // SAFETY: the display's context was just made current on this thread.
    // Its function pointers are used only while Graphics owns that context.
    unsafe { glow::Context::from_loader_function_cstr(|name| display.get_proc_address(name)) }
}
