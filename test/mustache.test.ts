import { CallSupport } from "../src";

describe("Mustache", () => {
  test("json", () => {
    const template = "{{foo}}";
    const variables = { foo: { bar: "baz" } };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual('{"bar":"baz"}');
  });

  test("array", () => {
    const template = "{{foo}}";
    const variables = { foo: [1, "2", 3] };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual('[1,"2",3]');
  });

  test("number", () => {
    const template = "{{foo}}";
    const variables = { foo: 1 };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("1");
  });

  test("conditional", () => {
    const template = "{{#bar}}{{foo}}{{/bar}}";
    expect(CallSupport.renderTemplate(template, { foo: 1, bar: [] })).toEqual(
      "",
    );
    expect(CallSupport.renderTemplate(template, { foo: 1, bar: true })).toEqual(
      "1",
    );
  });

  test("literal", () => {
    // I'm not sure that this is the correct behavior. But it's what we have today.
    const template = "{{{literal}}}";
    expect(
      CallSupport.renderTemplate(template, { literal: { foo: "bar" } }),
    ).toEqual("[object Object]");
  });

  test("undefined variable", () => {
    const template = "{{foo}}";
    const variables = {};
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("");
  });

  test("null variable", () => {
    const template = "{{foo}}";
    const variables = { foo: null };
    expect(() => {
      CallSupport.renderTemplate(template, variables as any);
    }).toThrow();
  });

  test("array variable", () => {
    const template = "{{#foo}}{{.}}{{/foo}}";
    const variables = { foo: [1, 2, 3] };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("123");
  });

  test("nested object", () => {
    const template = "{{foo.bar}}";
    const variables = { foo: { bar: "baz" } };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("baz");
  });

  test("unescaped characters", () => {
    const template = "{{{foo}}}";
    const variables = { foo: '<script>alert("xss")</script>' };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual('<script>alert("xss")</script>');
  });

  test("missing closing tag", () => {
    const template = "{{#foo}}{{bar}}";
    const variables = { foo: true, bar: "baz" };
    expect(() => {
      CallSupport.renderTemplate(template, variables);
    }).toThrow();
  });

  test("empty template", () => {
    const template = "";
    const variables = { foo: "bar" };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("");
  });

  test("whitespace handling", () => {
    const template = "{{ foo }}";
    const variables = { foo: "bar" };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("bar");
  });

  test("array of numbers and strings", () => {
    const template = "{{#foo}}{{.}}{{/foo}}";
    const variables = { foo: [1, "two", 3, "four"] };
    const formatted = CallSupport.renderTemplate(template, variables);
    expect(formatted).toEqual("1two3four");
  });

  test("missing variable", () => {
    const template = "{{foo}}";
    const variables = {};
    CallSupport.renderTemplate(template, variables);
  });
});
