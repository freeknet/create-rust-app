// ============================================================================
// Module:       @@module@@
// Description:  The command palette's model: commands, and the fuzzy matcher
//               that ranks them against what has been typed.
//
// Dependencies: std only. The drawing is gui::ui::command_palette.
// ============================================================================

//! Commands and fuzzy matching.
//!
//! A command is a title, a hint shown beside it, and whatever value the
//! caller wants back when it is chosen. The matcher is the part worth
//! testing — which of twenty commands comes first for "set" — and has
//! nothing to do with a window, so it lives here where its tests run
//! anywhere.
//!
//! ## How a match is scored
//!
//! Every character of the query must appear in the title, in order, case
//! ignored. Among the titles that match, a character scores more for
//! landing at the start of a word (so "ot" finds **O**pen **T**heme) and for
//! following the previous match directly (so "set" prefers **Set**tings to
//! **S**witch th**e**me **t**o …), and less the later in the title the match
//! begins. Ties keep the commands' own order, so the list never shuffles
//! between keystrokes that do not change the ranking.

/// One entry in the palette.
#[derive(Clone, Debug, PartialEq)]
pub struct Command<A> {
    /// What the palette shows and matches against.
    pub title: String,
    /// A quiet note beside it: a shortcut, or a category.
    pub hint: String,
    /// What the caller gets back when this is chosen.
    pub action: A,
}

impl<A> Command<A> {
    /// A command with a title, a hint, and its action.
    pub fn new(title: impl Into<String>, hint: impl Into<String>, action: A) -> Self {
        Self {
            title: title.into(),
            hint: hint.into(),
            action,
        }
    }
}

/// How well `query` matches `text`; `None` when it does not match at all.
/// Higher is better. An empty query matches everything equally.
#[must_use]
pub fn score(query: &str, text: &str) -> Option<i32> {
    let query: Vec<char> = query
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    if query.is_empty() {
        return Some(0);
    }
    let text: Vec<char> = text.chars().flat_map(char::to_lowercase).collect();
    let mut total = 0i32;
    let mut next = 0usize;
    let mut previous: Option<usize> = None;
    let mut first = None;
    for wanted in query {
        let found = text
            .iter()
            .enumerate()
            .skip(next)
            .find(|(_, c)| **c == wanted)
            .map(|(index, _)| index)?;
        first.get_or_insert(found);
        let word_start = found == 0
            || text
                .get(found - 1)
                .is_some_and(|before| !before.is_alphanumeric());
        total += 1;
        if word_start {
            total += 8;
        }
        if previous.is_some_and(|previous| previous + 1 == found) {
            total += 10;
        }
        previous = Some(found);
        next = found + 1;
    }
    let lead = i32::try_from(first.unwrap_or(0)).unwrap_or(i32::MAX);
    Some(total.saturating_sub(lead))
}

/// The commands matching `query`, best first, ties in their given order.
#[must_use]
pub fn filter<'a, A>(commands: &'a [Command<A>], query: &str) -> Vec<&'a Command<A>> {
    let mut ranked: Vec<(i32, usize, &Command<A>)> = commands
        .iter()
        .enumerate()
        .filter_map(|(index, command)| Some((score(query, &command.title)?, index, command)))
        .collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    ranked.into_iter().map(|(_, _, command)| command).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commands() -> Vec<Command<u8>> {
        vec![
            Command::new("Go to Overview", "Ctrl+1", 1),
            Command::new("Open settings", "Ctrl+,", 2),
            Command::new("Switch theme to Midnight", "Theme", 3),
            Command::new("Collapse sidebar", "Ctrl+B", 4),
        ]
    }

    fn titles(query: &str) -> Vec<String> {
        filter(&commands(), query)
            .into_iter()
            .map(|command| command.title.clone())
            .collect()
    }

    #[test]
    fn an_empty_query_keeps_every_command_in_order() {
        assert_eq!(titles("").len(), 4);
        assert_eq!(
            titles("   ").first().map(String::as_str),
            Some("Go to Overview")
        );
    }

    #[test]
    fn letters_must_appear_in_order() {
        assert!(score("abc", "a big cat").is_some());
        assert!(score("cba", "a big cat").is_none(), "order matters");
        assert!(score("xyz", "Open settings").is_none());
    }

    #[test]
    fn case_is_ignored() {
        assert_eq!(
            score("OPEN", "open settings"),
            score("open", "Open Settings")
        );
    }

    #[test]
    fn a_consecutive_match_beats_a_scattered_one() {
        assert_eq!(
            titles("set").first().map(String::as_str),
            Some("Open settings"),
            "{:?}",
            titles("set")
        );
    }

    #[test]
    fn word_initials_find_their_command() {
        assert_eq!(
            titles("cs").first().map(String::as_str),
            Some("Collapse sidebar")
        );
    }

    #[test]
    fn nothing_matching_is_an_empty_list_not_an_error() {
        assert!(titles("qqq").is_empty());
    }
}
