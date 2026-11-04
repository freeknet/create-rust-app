// ============================================================================
// Module:       @@module@@
// Description:  Drawing: one frame from the app state, with a rainbow title
//               bar, the list, and a status line of key hints.
//
// Dependencies: ratatui; crate::app
// ============================================================================

//! One frame, drawn from the state.
//!
//! [`draw`] only reads the [`App`]; it never changes it. That is what lets
//! the tests below render into ratatui's in-memory `TestBackend` and check
//! the result without a terminal.
//!
//! The title bar is a rainbow that starts at the project's accent colour
//! (`@@accent@@`) and drifts one step per tick. Each letter takes the next
//! hue along the wheel at fixed saturation and lightness, so the gradient
//! stays readable on both dark and light terminals.

use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};

use crate::app::{App, BINDINGS};

/// The accent colour chosen when the project was created.
pub const ACCENT_HEX: &str = "@@accent@@";

/// The title bar's text, letter-spaced like the scaffolder's own banner.
const TITLE: &str = "@@displayName@@";

/// Degrees of hue between neighbouring title letters.
const HUE_STEP: f32 = 12.0;

/// Degrees of hue the gradient drifts per tick.
const HUE_DRIFT: f32 = 4.0;

/// Draws the whole frame.
pub fn draw(frame: &mut ratatui::Frame<'_>, app: &App) {
    let [title, body, status] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(0),
        Constraint::Length(1),
    ])
    .areas(frame.area());
    frame.render_widget(title_bar(app.ticks()), title);
    draw_list(frame, app, body);
    frame.render_widget(status_line(app), status);
}

/// The title, one hue per letter, starting at the accent and drifting
/// with `ticks`.
#[must_use]
pub fn title_bar(ticks: u64) -> Line<'static> {
    let (red, green, blue) = parse_hex(ACCENT_HEX).unwrap_or((0x00, 0xe5, 0xff));
    // Precision does not matter here: only the hue's position on the
    // wheel is used, so the tick count is folded into one revolution.
    let drift = f32::from(u16::try_from(ticks % 360).unwrap_or(0)) * HUE_DRIFT;
    let mut hue = hue_of(red, green, blue) + drift;
    let mut spans = vec![Span::raw(" ")];
    for letter in TITLE.chars() {
        let (r, g, b) = hsl_to_rgb(hue, 0.95, 0.68);
        let style = Style::new()
            .fg(Color::Rgb(r, g, b))
            .add_modifier(Modifier::BOLD);
        spans.push(Span::styled(format!("{letter} "), style));
        hue += HUE_STEP;
    }
    Line::from(spans)
}

/// The list of items, with the selection highlighted in the accent.
fn draw_list(frame: &mut ratatui::Frame<'_>, app: &App, area: Rect) {
    let accent = accent();
    let items: Vec<ListItem<'_>> = app
        .items()
        .iter()
        .map(|item| {
            let mark = if item.done { "[x] " } else { "[ ] " };
            let style = if item.done {
                Style::new().add_modifier(Modifier::DIM | Modifier::CROSSED_OUT)
            } else {
                Style::new()
            };
            ListItem::new(Line::from(vec![
                Span::styled(mark, Style::new().fg(accent)),
                Span::styled(item.label.as_str(), style),
            ]))
        })
        .collect();
    let list = List::new(items)
        .block(Block::new().borders(Borders::TOP | Borders::BOTTOM))
        .highlight_style(Style::new().add_modifier(Modifier::REVERSED))
        .highlight_symbol("› ");
    let mut state = ListState::default().with_selected(Some(app.selected()));
    frame.render_stateful_widget(list, area, &mut state);
}

/// Key hints from [`BINDINGS`], then a progress count.
fn status_line(app: &App) -> Line<'static> {
    let key = Style::new().fg(accent()).add_modifier(Modifier::BOLD);
    let dim = Style::new().add_modifier(Modifier::DIM);
    let mut spans = vec![Span::raw(" ")];
    for (name, description) in BINDINGS.iter().filter_map(|binding| binding.hint) {
        spans.push(Span::styled(name, key));
        spans.push(Span::styled(format!(" {description}  "), dim));
    }
    spans.push(Span::raw(format!(
        "{}/{} done",
        app.done_count(),
        app.items().len()
    )));
    Line::from(spans)
}

/// The accent as a terminal colour, falling back to cyan if the hex
/// string was edited into something unparseable.
fn accent() -> Color {
    let (r, g, b) = parse_hex(ACCENT_HEX).unwrap_or((0x00, 0xe5, 0xff));
    Color::Rgb(r, g, b)
}

/// Parses `#rrggbb` (the `#` optional).
#[must_use]
pub fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let digits = hex.strip_prefix('#').unwrap_or(hex);
    if digits.len() != 6 || !digits.is_ascii() {
        return None;
    }
    let channel = |at: usize| {
        digits
            .get(at..at + 2)
            .and_then(|pair| u8::from_str_radix(pair, 16).ok())
    };
    Some((channel(0)?, channel(2)?, channel(4)?))
}

/// The hue of an RGB colour, in degrees `[0, 360)`.
#[must_use]
pub fn hue_of(red: u8, green: u8, blue: u8) -> f32 {
    let (r, g, b) = (
        f32::from(red) / 255.0,
        f32::from(green) / 255.0,
        f32::from(blue) / 255.0,
    );
    let max = r.max(g).max(b);
    let delta = max - r.min(g).min(b);
    if delta <= f32::EPSILON {
        return 0.0;
    }
    let sector = if (max - r).abs() <= f32::EPSILON {
        ((g - b) / delta).rem_euclid(6.0)
    } else if (max - g).abs() <= f32::EPSILON {
        (b - r) / delta + 2.0
    } else {
        (r - g) / delta + 4.0
    };
    sector * 60.0
}

/// Converts HSL (hue in degrees, any value; saturation and lightness in
/// `[0, 1]`) to RGB.
#[must_use]
pub fn hsl_to_rgb(hue: f32, saturation: f32, lightness: f32) -> (u8, u8, u8) {
    let chroma = (1.0 - (2.0 * lightness - 1.0).abs()) * saturation;
    let sector = hue.rem_euclid(360.0) / 60.0;
    let x = chroma * (1.0 - (sector.rem_euclid(2.0) - 1.0).abs());
    let (r, g, b) = match sector {
        s if s < 1.0 => (chroma, x, 0.0),
        s if s < 2.0 => (x, chroma, 0.0),
        s if s < 3.0 => (0.0, chroma, x),
        s if s < 4.0 => (0.0, x, chroma),
        s if s < 5.0 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };
    let base = lightness - chroma / 2.0;
    let to_byte = |channel: f32| ((channel + base) * 255.0).round().clamp(0.0, 255.0) as u8;
    (to_byte(r), to_byte(g), to_byte(b))
}

#[cfg(test)]
mod tests {
    use super::{draw, hsl_to_rgb, hue_of, parse_hex};
    use crate::app::App;

    #[test]
    fn hex_colours_parse_and_reject_garbage() -> anyhow::Result<()> {
        assert_eq!(parse_hex("#00e5ff"), Some((0x00, 0xe5, 0xff)), "with #");
        assert_eq!(parse_hex("ff6ec7"), Some((0xff, 0x6e, 0xc7)), "without #");
        assert_eq!(parse_hex("#fff"), None, "short form is not accepted");
        assert_eq!(parse_hex("#gggggg"), None, "non-hex digits are rejected");
        Ok(())
    }

    #[test]
    fn hue_and_hsl_agree_on_the_primaries() -> anyhow::Result<()> {
        for (hue, rgb) in [
            (0.0, (255, 0, 0)),
            (120.0, (0, 255, 0)),
            (240.0, (0, 0, 255)),
        ] {
            assert_eq!(hsl_to_rgb(hue, 1.0, 0.5), rgb, "hsl({hue}, 100%, 50%)");
            let (r, g, b) = rgb;
            let back = hue_of(r, g, b);
            assert!((back - hue).abs() < 0.01, "{rgb:?} has hue {back}");
        }
        Ok(())
    }

    #[test]
    fn a_frame_shows_the_items_and_the_hints() -> anyhow::Result<()> {
        let backend = ratatui::backend::TestBackend::new(80, 10);
        let mut terminal = ratatui::Terminal::new(backend)?;
        let app = App::new();
        terminal.draw(|frame| draw(frame, &app))?;
        let text: String = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(ratatui::buffer::Cell::symbol)
            .collect();
        let first = app.items().first().map(|item| item.label.as_str());
        let first = first.unwrap_or_default();
        assert!(text.contains(first), "the first item is drawn: {text:?}");
        assert!(text.contains("quit"), "the quit hint is drawn: {text:?}");
        Ok(())
    }
}
