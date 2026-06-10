pub const OUTPUT: &str = "output";
pub const INPUT: &str = "input";
pub const RECOVERY: &str = "recovery";
pub const LEAK: &str = "leak";
pub const UNKNOWN: &str = "unknown";

const LEAK_KEYWORDS: &[&str] = &[
    "scroll", "scrolling", "twitter", "x.com", "tiktok", "instagram", "ig",
    "reels", "youtube", "yt", "feed", "reddit", "news", "social",
    "doomscroll", "browse", "browsing", "distract", "distracted",
    "distraction", "wander", "wandering", "nothing", "staring", "zoned",
    "procrastinate", "procrastinating", "phone",
];

const RECOVERY_KEYWORDS: &[&str] = &[
    "lunch", "break", "walk", "walking", "rest", "resting", "nap", "sleep",
    "coffee", "tea", "snack", "eat", "eating", "meal", "breakfast", "dinner",
    "gym", "workout", "exercise", "run", "running", "stretch", "yoga",
    "shower", "meditate", "meditation",
];

const INPUT_KEYWORDS: &[&str] = &[
    "meeting", "meet", "call", "calls", "standup", "sync", "email", "emails",
    "inbox", "slack", "chat", "dm", "message", "messages", "messenger",
    "discord", "teams", "zoom", "review", "reviewing", "admin", "paperwork",
    "calendar", "scheduling", "interview",
];

const OUTPUT_KEYWORDS: &[&str] = &[
    "code", "coding", "build", "building", "dev", "develop", "developing",
    "design", "designing", "write", "writing", "wrote", "draft", "drafting",
    "ship", "shipping", "research", "researching", "study", "studying",
    "plan", "planning", "prototype", "prototyping", "deep work", "focus",
    "focused", "model", "modeling", "sell", "selling", "outreach",
    "prospect", "content", "video", "edit", "editing", "record", "recording",
    "marketing", "market", "sales", "launch", "launching", "create",
    "creating", "fix", "fixing", "implement", "refactor", "blog", "article",
    "post",
];

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric()
}

fn contains_word(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() || needle.len() > haystack.len() {
        return false;
    }
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    let mut i = 0usize;
    while i + n.len() <= h.len() {
        if &h[i..i + n.len()] == n {
            let before_ok = i == 0 || !is_word_char(h[i - 1]);
            let after = i + n.len();
            let after_ok = after == h.len() || !is_word_char(h[after]);
            if before_ok && after_ok {
                return true;
            }
        }
        i += 1;
    }
    false
}

pub fn categorize(activity: &str) -> &'static str {
    let lower = activity.to_lowercase();
    let lower = lower.trim();
    if lower.is_empty() {
        return UNKNOWN;
    }
    if LEAK_KEYWORDS.iter().any(|k| contains_word(lower, k)) {
        return LEAK;
    }
    if RECOVERY_KEYWORDS.iter().any(|k| contains_word(lower, k)) {
        return RECOVERY;
    }
    if INPUT_KEYWORDS.iter().any(|k| contains_word(lower, k)) {
        return INPUT;
    }
    if OUTPUT_KEYWORDS.iter().any(|k| contains_word(lower, k)) {
        return OUTPUT;
    }
    UNKNOWN
}

pub fn is_valid(category: &str) -> bool {
    matches!(category, OUTPUT | INPUT | RECOVERY | LEAK | UNKNOWN)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leak_wins_over_others() {
        assert_eq!(categorize("scrolling twitter"), LEAK);
        assert_eq!(categorize("code and scroll"), LEAK);
    }

    #[test]
    fn recovery_keywords() {
        assert_eq!(categorize("lunch break"), RECOVERY);
        assert_eq!(categorize("Coffee"), RECOVERY);
    }

    #[test]
    fn output_keywords() {
        assert_eq!(categorize("coding backend"), OUTPUT);
        assert_eq!(categorize("Writing"), OUTPUT);
        assert_eq!(categorize("deep work"), OUTPUT);
    }

    #[test]
    fn input_keywords() {
        assert_eq!(categorize("Team meeting"), INPUT);
        assert_eq!(categorize("email"), INPUT);
    }

    #[test]
    fn unknown_default() {
        assert_eq!(categorize("xyzzy"), UNKNOWN);
        assert_eq!(categorize(""), UNKNOWN);
    }

    #[test]
    fn word_boundary_avoids_false_positives() {
        // "tea" should not match "team"
        assert_eq!(categorize("team standup"), INPUT);
        // "eat" should not match "feature"
        assert_eq!(categorize("feature design"), OUTPUT);
        // "ig" should not match "ignore"
        assert_eq!(categorize("ignore everything"), UNKNOWN);
        // "run" should match "run" alone
        assert_eq!(categorize("morning run"), RECOVERY);
        // "dev" should not match "develop"
        assert_eq!(categorize("developing feature"), OUTPUT);
    }

    #[test]
    fn punctuation_and_dots() {
        assert_eq!(categorize("watching x.com"), LEAK);
        assert_eq!(categorize("on a 1:1 call"), INPUT);
    }
}
