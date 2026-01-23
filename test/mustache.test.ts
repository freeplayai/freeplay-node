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

  describe("empty array handling", () => {
    test("empty array with section should not render", () => {
      const template = "{{#items}}Item: {{.}}{{/items}}";
      const variables = { items: [] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("");
    });

    test("empty array with inverse section should render", () => {
      const template = "{{^items}}No items available{{/items}}";
      const variables = { items: [] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("No items available");
    });

    test("non-empty array with section should render", () => {
      const template = "{{#items}}Item: {{.}}{{/items}}";
      const variables = { items: ["foo", "bar"] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Item: fooItem: bar");
    });

    test("non-empty array with inverse section should not render", () => {
      const template = "{{^items}}No items available{{/items}}";
      const variables = { items: ["foo", "bar"] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("");
    });

    test("empty array with both section and inverse", () => {
      const template = `{{#items}}
Item: {{.}}
{{/items}}
{{^items}}
No items available
{{/items}}`;
      const variables = { items: [] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("No items available");
      expect(formatted).not.toContain("Item:");
    });

    test("non-empty array with both section and inverse", () => {
      const template = `{{#items}}
Item: {{.}}
{{/items}}
{{^items}}
No items available
{{/items}}`;
      const variables = { items: ["foo"] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("Item: foo");
      expect(formatted).not.toContain("No items available");
    });

    test("empty array with unique_offers template from bug report", () => {
      const template = `{{#unique_offers}}
DATA: {{.}}
{{/unique_offers}}
{{^unique_offers}}
You have no knowledge of personalized unique offers for this subscriber.
{{/unique_offers}}`;
      const variables = { unique_offers: [] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("You have no knowledge of personalized unique offers for this subscriber.");
      expect(formatted).not.toContain("DATA:");
    });

    test("non-empty array with unique_offers template", () => {
      const template = `{{#unique_offers}}
DATA: {{.}}
{{/unique_offers}}
{{^unique_offers}}
You have no knowledge of personalized unique offers for this subscriber.
{{/unique_offers}}`;
      const variables = { unique_offers: ["offer1", "offer2"] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("DATA: offer1");
      expect(formatted).toContain("DATA: offer2");
      expect(formatted).not.toContain("You have no knowledge of personalized unique offers for this subscriber.");
    });

    test("undefined variable with inverse section should render", () => {
      const template = "{{^items}}No items available{{/items}}";
      const variables = {};
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("No items available");
    });

    test("false boolean with inverse section should render", () => {
      const template = "{{^flag}}Flag is false{{/flag}}";
      const variables = { flag: false };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Flag is false");
    });

    test("empty string with inverse section should render", () => {
      const template = "{{^text}}No text available{{/text}}";
      const variables = { text: "" };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("No text available");
    });

    test("JSON stringified empty array is truthy (edge case)", () => {
      const template = `{{#items}}
Item: {{.}}
{{/items}}
{{^items}}
No items available
{{/items}}`;
      const variables = { items: "[]" as any };
      const formatted = CallSupport.renderTemplate(template, variables);
      // String "[]" is truthy, so the section renders, not the inverse
      expect(formatted).toContain("Item: []");
      expect(formatted).not.toContain("No items available");
    });

    test("zero is falsy with inverse section", () => {
      const template = "{{^count}}No count{{/count}}";
      const variables = { count: 0 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("No count");
    });

    test("nested object with empty array property", () => {
      const template = `{{#data.items}}
Item: {{.}}
{{/data.items}}
{{^data.items}}
No items in data
{{/data.items}}`;
      const variables = { data: { items: [] } };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("No items in data");
      expect(formatted).not.toContain("Item:");
    });

    test("array with single empty string should render section", () => {
      const template = `{{#items}}
Item: [{{.}}]
{{/items}}
{{^items}}
No items
{{/items}}`;
      const variables = { items: [""] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("Item: []");
      expect(formatted).not.toContain("No items");
    });

    test("array with null should render section", () => {
      const template = `{{#items}}
Item: {{.}}
{{/items}}
{{^items}}
No items
{{/items}}`;
      const variables = { items: [null] as any };
      expect(() => {
        CallSupport.renderTemplate(template, variables as any);
      }).toThrow();
    });
  });

  describe("zero value handling", () => {
    test("zero as simple variable should render", () => {
      const template = "Count: {{count}}";
      const variables = { count: 0 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Count: 0");
    });

    test("zero in section should not render (falsy)", () => {
      const template = "{{#count}}Count is: {{.}}{{/count}}";
      const variables = { count: 0 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("");
    });

    test("zero with inverse section should render inverse", () => {
      const template = "{{^count}}No count{{/count}}";
      const variables = { count: 0 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("No count");
    });

    test("zero with both section and inverse", () => {
      const template = `{{#count}}
Count is: {{.}}
{{/count}}
{{^count}}
Count is zero or missing
{{/count}}`;
      const variables = { count: 0 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toContain("Count is zero or missing");
      expect(formatted).not.toContain("Count is: 0");
    });

    test("positive number in section should render", () => {
      const template = "{{#count}}Count is: {{.}}{{/count}}";
      const variables = { count: 5 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Count is: 5");
    });

    test("positive number with inverse section should not render inverse", () => {
      const template = "{{^count}}No count{{/count}}";
      const variables = { count: 5 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("");
    });

    test("negative number in section should render", () => {
      const template = "{{#count}}Count is: {{.}}{{/count}}";
      const variables = { count: -5 };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Count is: -5");
    });

    test("array with zero should render section", () => {
      const template = "{{#numbers}}Number: {{.}} {{/numbers}}";
      const variables = { numbers: [0, 1, 2] };
      const formatted = CallSupport.renderTemplate(template, variables);
      expect(formatted).toEqual("Number: 0 Number: 1 Number: 2 ");
    });

    test("zero vs undefined vs null behavior", () => {
      const template = "Value: {{value}}";
      
      // Zero should render as "0"
      expect(CallSupport.renderTemplate(template, { value: 0 })).toEqual("Value: 0");
      
      // Undefined should render as empty string
      expect(CallSupport.renderTemplate(template, {})).toEqual("Value: ");
      
      // Null should throw
      expect(() => {
        CallSupport.renderTemplate(template, { value: null } as any);
      }).toThrow();
    });
  });
});
