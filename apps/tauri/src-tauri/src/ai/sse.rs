//! Server-Sent Events framing (WHATWG HTML §9.2.6): bytes in, `(event, data)` records out.
//! Both providers stream this way. Chunks arrive split anywhere (mid-line, mid-UTF-8 sequence),
//! so the decoder buffers bytes and only decodes a record once its terminating blank line is in.

#[derive(Debug, PartialEq, Eq, Clone, Default)]
pub struct SseEvent {
    /// The `event:` field; `None` means the default `message` type (OpenAI sends only `data:`).
    pub event: Option<String>,
    pub data: String,
}

#[derive(Default)]
pub struct SseDecoder {
    buf: Vec<u8>,
}

impl SseDecoder {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseEvent> {
        self.buf.extend_from_slice(chunk);
        let mut out = Vec::new();
        while let Some((end, skip)) = find_record_end(&self.buf) {
            let record: Vec<u8> = self.buf.drain(..end + skip).take(end).collect();
            out.extend(parse_record(&record));
        }
        out
    }

    /// A stream that ends without its final blank line still delivers its last record.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let rest = std::mem::take(&mut self.buf);
        parse_record(&rest).into_iter().collect()
    }
}

/// Position of the first blank line: (end of the record, length of the separator).
fn find_record_end(buf: &[u8]) -> Option<(usize, usize)> {
    let mut i = 0;
    while i < buf.len() {
        // A blank line is two line terminators in a row, where a terminator is \n, \r\n or \r.
        let first = line_break_len(&buf[i..]);
        if first > 0 {
            let second = line_break_len(&buf[i + first..]);
            if second > 0 {
                return Some((i, first + second));
            }
            // A lone "\r" at the very end might be the first half of "\r\n": wait for more.
            if first == 1 && buf[i] == b'\r' && i + first >= buf.len() {
                return None;
            }
        }
        i += 1;
    }
    None
}

fn line_break_len(s: &[u8]) -> usize {
    match s {
        [b'\r', b'\n', ..] => 2,
        [b'\n', ..] | [b'\r', ..] => 1,
        _ => 0,
    }
}

fn parse_record(record: &[u8]) -> Option<SseEvent> {
    let text = String::from_utf8_lossy(record);
    let mut event = None;
    let mut data: Vec<&str> = Vec::new();
    for line in text.split(['\n', '\r']) {
        if line.is_empty() || line.starts_with(':') {
            continue; // comment / keep-alive
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => event = Some(value.to_owned()),
            "data" => data.push(value),
            _ => {}
        }
    }
    (!data.is_empty()).then(|| SseEvent {
        event,
        data: data.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(event: Option<&str>, data: &str) -> SseEvent {
        SseEvent {
            event: event.map(str::to_owned),
            data: data.to_owned(),
        }
    }

    #[test]
    fn splits_records_and_reads_event_names() {
        let mut d = SseDecoder::default();
        let got = d.push(b"data: one\n\nevent: ping\ndata: two\n\n");
        assert_eq!(got, vec![ev(None, "one"), ev(Some("ping"), "two")]);
    }

    #[test]
    fn handles_a_record_split_across_chunks_even_inside_a_utf8_character() {
        let bytes = "data: สวัสดี\n\n".as_bytes();
        let mut d = SseDecoder::default();
        let mut got = Vec::new();
        for b in bytes.chunks(1) {
            got.extend(d.push(b));
        }
        assert_eq!(got, vec![ev(None, "สวัสดี")]);
    }

    #[test]
    fn accepts_crlf_and_cr_line_endings() {
        let mut d = SseDecoder::default();
        assert_eq!(
            d.push(b"data: a\r\n\r\ndata: b\r\r"),
            vec![ev(None, "a"), ev(None, "b")]
        );
    }

    #[test]
    fn joins_multiple_data_lines_and_ignores_comments() {
        let mut d = SseDecoder::default();
        assert_eq!(
            d.push(b": keep-alive\ndata: line1\ndata: line2\n\n"),
            vec![ev(None, "line1\nline2")]
        );
        assert!(d.push(b": only a comment\n\n").is_empty());
    }

    #[test]
    fn data_without_a_space_after_the_colon_and_empty_data() {
        let mut d = SseDecoder::default();
        assert_eq!(d.push(b"data:{\"a\":1}\n\n"), vec![ev(None, "{\"a\":1}")]);
        // `data` with no colon at all is a field with an empty value: a record with empty data.
        assert_eq!(d.push(b"data\n\n"), vec![ev(None, "")]);
    }

    #[test]
    fn a_trailing_record_without_its_blank_line_is_delivered_on_finish() {
        let mut d = SseDecoder::default();
        assert!(d.push(b"data: tail\n").is_empty());
        assert_eq!(d.finish(), vec![ev(None, "tail")]);
        assert!(d.finish().is_empty());
    }

    #[test]
    fn a_lone_cr_at_the_end_waits_for_a_possible_lf() {
        let mut d = SseDecoder::default();
        // "\r" could be the first half of "\r\n", so it is not yet a line break we can act on.
        assert!(d.push(b"data: x\r").is_empty());
        assert_eq!(d.push(b"\n\r\n"), vec![ev(None, "x")]);
    }
}
