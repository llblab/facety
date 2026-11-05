//! Minimal JSON helpers (std only): escaping for output and a strict validator used by tests and tools.

/// A JSON string literal for `s`, escaping quotes, backslashes and control characters.
pub fn string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A JSON number for a finite float; `null` for NaN or infinity (never produced by validated configurations).
pub fn number(x: f64) -> String {
    if x.is_finite() {
        format!("{x}")
    } else {
        "null".to_string()
    }
}

pub fn option_number(x: Option<f64>) -> String {
    x.map_or("null".to_string(), number)
}

/// Checks that `text` is exactly one well-formed JSON value (RFC 8259 grammar, depth-limited).
pub fn validate(text: &str) -> Result<(), String> {
    let b = text.as_bytes();
    let mut i = 0;
    skip(b, &mut i);
    value(b, &mut i, 0)?;
    skip(b, &mut i);
    if i != b.len() {
        return Err(format!("trailing characters at byte {i}"));
    }
    Ok(())
}

fn skip(b: &[u8], i: &mut usize) {
    while *i < b.len() && matches!(b[*i], b' ' | b'\n' | b'\r' | b'\t') {
        *i += 1;
    }
}

fn expect(b: &[u8], i: &mut usize, lit: &str) -> Result<(), String> {
    if b[*i..].starts_with(lit.as_bytes()) {
        *i += lit.len();
        Ok(())
    } else {
        Err(format!("expected {lit} at byte {i}", i = *i))
    }
}

fn value(b: &[u8], i: &mut usize, depth: usize) -> Result<(), String> {
    if depth > 64 {
        return Err("nesting too deep".into());
    }
    match b.get(*i) {
        None => Err("unexpected end".into()),
        Some(b'{') => {
            *i += 1;
            skip(b, i);
            if b.get(*i) == Some(&b'}') {
                *i += 1;
                return Ok(());
            }
            loop {
                skip(b, i);
                str_(b, i)?;
                skip(b, i);
                expect(b, i, ":")?;
                skip(b, i);
                value(b, i, depth + 1)?;
                skip(b, i);
                match b.get(*i) {
                    Some(b',') => *i += 1,
                    Some(b'}') => {
                        *i += 1;
                        return Ok(());
                    }
                    _ => return Err(format!("expected , or }} at byte {i}", i = *i)),
                }
            }
        }
        Some(b'[') => {
            *i += 1;
            skip(b, i);
            if b.get(*i) == Some(&b']') {
                *i += 1;
                return Ok(());
            }
            loop {
                skip(b, i);
                value(b, i, depth + 1)?;
                skip(b, i);
                match b.get(*i) {
                    Some(b',') => *i += 1,
                    Some(b']') => {
                        *i += 1;
                        return Ok(());
                    }
                    _ => return Err(format!("expected , or ] at byte {i}", i = *i)),
                }
            }
        }
        Some(b'"') => str_(b, i),
        Some(b't') => expect(b, i, "true"),
        Some(b'f') => expect(b, i, "false"),
        Some(b'n') => expect(b, i, "null"),
        Some(_) => num(b, i),
    }
}

fn str_(b: &[u8], i: &mut usize) -> Result<(), String> {
    if b.get(*i) != Some(&b'"') {
        return Err(format!("expected string at byte {i}", i = *i));
    }
    *i += 1;
    while let Some(&c) = b.get(*i) {
        match c {
            b'"' => {
                *i += 1;
                return Ok(());
            }
            b'\\' => {
                match b.get(*i + 1) {
                    Some(b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't') => *i += 2,
                    Some(b'u') if b.len() >= *i + 6 && b[*i + 2..*i + 6].iter().all(u8::is_ascii_hexdigit) => *i += 6,
                    _ => return Err(format!("bad escape at byte {i}", i = *i)),
                };
            }
            c if c < 0x20 => return Err(format!("raw control character at byte {i}", i = *i)),
            _ => *i += 1,
        }
    }
    Err("unterminated string".into())
}

fn num(b: &[u8], i: &mut usize) -> Result<(), String> {
    let start = *i;
    if b.get(*i) == Some(&b'-') {
        *i += 1;
    }
    let digits = |b: &[u8], i: &mut usize| {
        let s = *i;
        while b.get(*i).is_some_and(u8::is_ascii_digit) {
            *i += 1;
        }
        *i > s
    };
    if b.get(*i) == Some(&b'0') {
        *i += 1;
    } else if !digits(b, i) {
        return Err(format!("bad number at byte {start}"));
    }
    if b.get(*i) == Some(&b'.') {
        *i += 1;
        if !digits(b, i) {
            return Err(format!("bad fraction at byte {start}"));
        }
    }
    if matches!(b.get(*i), Some(b'e' | b'E')) {
        *i += 1;
        if matches!(b.get(*i), Some(b'+' | b'-')) {
            *i += 1;
        }
        if !digits(b, i) {
            return Err(format!("bad exponent at byte {start}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strings_are_escaped_and_the_validator_is_strict() {
        let nasty = "a\"b\\c\nd\te\u{1}f\u{e9}\u{4e2d}";
        let encoded = string(nasty);
        assert!(validate(&encoded).is_ok(), "{encoded}");
        assert!(encoded.contains("\\u0001") && encoded.contains("\\n") && encoded.contains("\\\""));
        for good in ["{}", "[]", "[1,2.5,-3e2,true,false,null]", "{\"a\":{\"b\":[\"x\"]}}", " 0 "] {
            assert!(validate(good).is_ok(), "{good}");
        }
        for bad in ["", "{", "[1,]", "{\"a\":}", "01", "1.", "\"\u{1}\"", "[1] x", "{'a':1}", "nul", "[\"\\x\"]", "{\"a\" 1}"] {
            assert!(validate(bad).is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn non_finite_numbers_never_leak_into_json() {
        assert_eq!(number(f64::NAN), "null");
        assert_eq!(number(f64::INFINITY), "null");
        assert_eq!(number(0.25), "0.25");
        assert_eq!(option_number(None), "null");
    }
}
