// ============================================================================
// Module:       @@module@@
// Description:  Input: crossterm's event stream reduced to key presses,
//               resizes, and a steady tick when nothing happens.
//
// Dependencies: crossterm
// ============================================================================

//! Input, as the app sees it.
//!
//! The loop blocks on [`Events::wait`] instead of spinning, so an idle app
//! uses no CPU. A tick still arrives every interval, which is what drives
//! animation: the wait for input is bounded by the time left until the
//! next tick, so a burst of key presses never starves it.

use std::time::{Duration, Instant};

use crossterm::event::{KeyEvent, KeyEventKind};

/// Something the app should react to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    /// The tick interval elapsed.
    Tick,
    /// A key was pressed (releases and repeats are filtered out).
    Key(KeyEvent),
    /// The terminal changed size; the next frame should be redrawn.
    Resize,
}

/// The input source: crossterm's events plus a tick.
#[derive(Debug)]
pub struct Events {
    /// Time between ticks.
    tick: Duration,
    /// When the last tick was delivered.
    last_tick: Instant,
}

impl Events {
    /// Starts an input source that ticks every `tick`.
    #[must_use]
    pub fn new(tick: Duration) -> Self {
        Self {
            tick,
            last_tick: Instant::now(),
        }
    }

    /// Waits for the next event.
    ///
    /// # Errors
    ///
    /// Returns an error when the terminal cannot be read.
    pub fn wait(&mut self) -> std::io::Result<Event> {
        loop {
            let timeout = self.tick.saturating_sub(self.last_tick.elapsed());
            if !crossterm::event::poll(timeout)? {
                self.last_tick = Instant::now();
                return Ok(Event::Tick);
            }
            let event = crossterm::event::read()?;
            // Windows reports both press and release; acting on both would
            // move the selection twice per key.
            if let crossterm::event::Event::Key(key) = event
                && key.kind == KeyEventKind::Press
            {
                return Ok(Event::Key(key));
            }
            if let crossterm::event::Event::Resize(_, _) = event {
                return Ok(Event::Resize);
            }
            // Mouse, focus, and paste events are not used; keep waiting.
        }
    }
}
