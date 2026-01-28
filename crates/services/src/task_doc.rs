pub fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("User Authentication"), "user-authentication");
    }

    #[test]
    fn test_slugify_with_numbers() {
        assert_eq!(slugify("API v2 Integration"), "api-v2-integration");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Fix: Bug #123 [URGENT]"), "fix-bug-123-urgent");
    }

    #[test]
    fn test_slugify_multiple_dashes() {
        assert_eq!(slugify("A   B---C"), "a-b-c");
    }

    #[test]
    fn test_slugify_chinese() {
        assert_eq!(slugify("用户登录 API"), "api");
    }
}
