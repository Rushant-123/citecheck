import { describe, expect, it } from "vitest";
import { extractText, normalize, quoteMatch } from "../src/text";

describe("extractText", () => {
  it("strips tags, scripts, styles and collapses whitespace", () => {
    const html = `<html><head><title>T</title><style>.a{color:red}</style>
      <script>var x = 1;</script></head>
      <body><nav>Menu</nav><h1>Hello   <b>world</b></h1>
      <p>Second &amp; paragraph.</p></body></html>`;
    expect(extractText(html)).toBe("T Menu Hello world Second & paragraph.");
  });

  it("returns plain text unchanged when there is no markup", () => {
    expect(extractText("just text")).toBe("just text");
  });
});

describe("normalize", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalize("  Hello,   World!  It's 2026. ")).toBe("hello world it s 2026");
  });
  it("normalizes curly quotes and dashes", () => {
    expect(normalize("don’t “quote” me — ok")).toBe("don t quote me ok");
  });
});

describe("quoteMatch", () => {
  const page =
    "The study found that 12% of citation URLs did not resolve. Deep research agents were worse than plain search. Authors recommend a liveness tool.";

  it("finds an exact quote with score 1", () => {
    const r = quoteMatch("12% of citation URLs did not resolve", page);
    expect(r.found).toBe(true);
    expect(r.score).toBe(1);
    expect(r.snippet).toContain("12% of citation URLs did not resolve");
  });

  it("finds a quote despite punctuation and case differences", () => {
    const r = quoteMatch("deep research agents were WORSE than plain search!", page);
    expect(r.found).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.95);
  });

  it("scores a near-paraphrase below the found threshold", () => {
    const r = quoteMatch("the study found that most citation URLs resolve fine", page);
    expect(r.found).toBe(false);
    expect(r.score).toBeLessThan(0.8);
  });

  it("returns 0 for text that is absent", () => {
    const r = quoteMatch("elephants are purple", page);
    expect(r.found).toBe(false);
    expect(r.score).toBeLessThan(0.3);
  });

  it("handles an empty quote", () => {
    const r = quoteMatch("", page);
    expect(r.found).toBe(false);
    expect(r.score).toBe(0);
  });
});
