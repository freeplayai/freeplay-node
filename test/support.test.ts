import { CallSupport, FreeplayClientError } from "../src";

describe("support", () => {
  test("variable validation", () => {
    CallSupport.assertIsInputVariables({
      a: "b",
      c: [1, 2, 3],
      d: {
        a: "q",
      },
    });
  });

  test("variable validation rejects invalid", () => {
    const t = () => {
      CallSupport.assertIsInputVariables({
        a: (x: any) => x,
      });
    };
    expect(t).toThrow(FreeplayClientError);
  });
});
