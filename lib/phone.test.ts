import { describe, expect, it } from "vitest";

import {
  caretAfterFormatting,
  cleanPhoneValue,
  dialCodeFor,
  exceedsMaxDigits,
  getCountryCallingAndPhoneNumber,
  phonePlaceholder,
  phoneStateForCountry,
  phoneStateFromInput,
  phoneStateFromValue,
  phoneValue,
  resolveDeletion,
} from "@/lib/phone";

// What the API-facing code (businesses, business settings, sales settings)
// uses to split one stored number into `country_code` + `mobile_no`.
describe("getCountryCallingAndPhoneNumber", () => {
  it("splits an international number into its calling code and national number", () => {
    expect(getCountryCallingAndPhoneNumber("+61 412 345 678")).toEqual({
      countryCallingCode: "+61",
      nationalNumber: "412345678",
    });
    expect(getCountryCallingAndPhoneNumber("+64 21 234 5678")).toEqual({
      countryCallingCode: "+64",
      nationalNumber: "212345678",
    });
  });

  it("reads digits with no leading + as international", () => {
    expect(getCountryCallingAndPhoneNumber("61412345678")).toEqual({
      countryCallingCode: "+61",
      nationalNumber: "412345678",
    });
  });

  it.each([undefined, null, "", "   ", "+", "undefined", "null"])(
    "falls back to the default calling code for %j",
    (empty) => {
      expect(getCountryCallingAndPhoneNumber(empty)).toEqual({
        countryCallingCode: "+61",
        nationalNumber: "",
      });
    },
  );

  it("uses the default it is given, with or without the +", () => {
    expect(getCountryCallingAndPhoneNumber("", "+64").countryCallingCode).toBe("+64");
    expect(getCountryCallingAndPhoneNumber("", "64").countryCallingCode).toBe("+64");
  });

  it("splits exactly what the PhoneInput stores", () => {
    const stored = phoneValue(phoneStateFromInput("0412 345 678", "AU"));
    expect(getCountryCallingAndPhoneNumber(stored)).toEqual({
      countryCallingCode: "+61",
      nationalNumber: "412345678",
    });
  });
});

describe("dialCodeFor", () => {
  it("is the number the picker shows beside the flag", () => {
    expect(dialCodeFor("AU")).toBe("61");
    expect(dialCodeFor("NZ")).toBe("64");
    expect(dialCodeFor("US")).toBe("1");
  });
});

describe("typing a national number", () => {
  it("takes an Australian mobile as people write it, trunk 0 and all", () => {
    const state = phoneStateFromInput("0412345678", "AU");
    expect(state).toEqual({ country: "AU", text: "0412 345 678" });
    // …and the stored value carries the dial code, with the 0 gone.
    expect(phoneValue(state)).toBe("+61 412 345 678");
  });

  it("takes the same number without the trunk 0", () => {
    expect(phoneValue(phoneStateFromInput("412345678", "AU"))).toBe(
      "+61 412 345 678",
    );
  });

  it("formats as you go, per country", () => {
    expect(phoneStateFromInput("4155552671", "US").text).toBe("(415) 555-2671");
    expect(phoneValue(phoneStateFromInput("4155552671", "US"))).toBe(
      "+1 415 555 2671",
    );
    expect(phoneValue(phoneStateFromInput("021 234 5678", "NZ"))).toBe(
      "+64 21 234 5678",
    );
  });

  it("holds a half-typed number as a value that is not yet complete", () => {
    expect(phoneValue(phoneStateFromInput("0412 34", "AU"))).toBe("+61 41234");
  });

  it("ignores anything that is not a digit", () => {
    expect(phoneStateFromInput("04a1b2", "AU").text).toBe("0412");
  });
});

describe("an empty field", () => {
  it("is an empty value, not a bare dial code", () => {
    // A required field must be able to say "Enter your mobile number".
    expect(phoneValue({ country: "AU", text: "" })).toBe("");
    expect(phoneValue({ country: "AU", text: "   " })).toBe("");
  });

  it("is still empty when only the trunk 0 has been typed", () => {
    expect(phoneValue(phoneStateFromInput("0", "AU"))).toBe("");
  });
});

describe("typing or pasting an international number", () => {
  it("moves a pasted full number into the picker and keeps the national part", () => {
    const state = phoneStateFromInput("+61 412 345 678", "AU");
    // Shown the way a saved number reads back, and stored with the dial code.
    expect(state).toEqual({ country: "AU", text: "0412 345 678" });
    expect(phoneValue(state)).toBe("+61 412 345 678");
  });

  it("finds the number inside surrounding text", () => {
    expect(phoneValue(phoneStateFromInput("Mobile: +61 412 345 678", "AU"))).toBe(
      "+61 412 345 678",
    );
    expect(phoneValue(phoneStateFromInput("Mobile: 0412 345 678", "AU"))).toBe(
      "+61 412 345 678",
    );
  });

  it("switches country when the pasted dial code is a different one", () => {
    const state = phoneStateFromInput("+64 21 234 5678", "AU");
    expect(state.country).toBe("NZ");
    expect(phoneValue(state)).toBe("+64 21 234 5678");
  });

  it("absorbs the selected country's own dial code as it is typed", () => {
    // "+61" typed while Australia is picked: the picker already says so.
    expect(phoneStateFromInput("+61", "AU")).toEqual({ country: "AU", text: "" });
    expect(phoneStateFromInput("+61 4", "AU")).toEqual({
      country: "AU",
      text: "4",
    });
  });

  it("leaves a dial code it cannot place yet exactly as typed", () => {
    const state = phoneStateFromInput("+6", "AU");
    expect(state).toEqual({ country: "AU", text: "+6" });
  });
});

describe("a value that came from outside", () => {
  it.each(["+61412345678", "+61 412 345 678", "0412345678", "61412345678"])(
    "reads %s as the same Australian number",
    (saved) => {
      const state = phoneStateFromValue(saved, "AU");
      expect(state).toEqual({ country: "AU", text: "0412 345 678" });
    },
  );

  it("takes the country from the number, not from the fallback", () => {
    expect(phoneStateFromValue("+64 21 234 5678", "AU").country).toBe("NZ");
  });

  it("starts empty on the fallback country", () => {
    expect(phoneStateFromValue("", "NZ")).toEqual({ country: "NZ", text: "" });
    expect(phoneStateFromValue(undefined, "NZ")).toEqual({
      country: "NZ",
      text: "",
    });
  });

  it("treats a bare dial code with no number as empty, not as literal text", () => {
    
    expect(phoneStateFromValue("+61", "AU")).toEqual({
      country: "AU",
      text: "",
    });
    // Generalises beyond the fallback's own dial code too.
    expect(phoneStateFromValue("+64", "AU")).toEqual({
      country: "NZ",
      text: "",
    });
  });

  it("drops the literal 'undefined' a bad save once left behind", () => {
    expect(cleanPhoneValue("undefined")).toBe("");
    expect(cleanPhoneValue("+61 412 345 678null")).toBe("+61 412 345 678");
    expect(phoneStateFromValue("undefined", "AU").text).toBe("");
  });

  it("round-trips: what the field emits is what it reads back", () => {
    const emitted = phoneValue(phoneStateFromInput("0412345678", "AU"));
    expect(phoneValue(phoneStateFromValue(emitted, "AU"))).toBe(emitted);
  });
});

describe("picking a different country", () => {
  it("keeps the digits already typed and re-formats them", () => {
    const state = phoneStateForCountry("0412 345 678", "NZ");
    expect(state.country).toBe("NZ");
    expect(state.text.replace(/\D/g, "")).toBe("0412345678");
  });

  it("drops a half-typed international number that belonged to the old country", () => {
    expect(phoneStateForCountry("+6", "NZ")).toEqual({ country: "NZ", text: "" });
  });
});

describe("placeholder", () => {
  it("shows the shape this country's mobiles take", () => {
    expect(phonePlaceholder("AU")).toBe("0412 345 678");
    expect(phonePlaceholder("NZ")).toBe("021 123 4567");
  });
});

describe("deleting through formatting", () => {
  it("backspacing over a space removes the digit before it instead of sticking", () => {
    // "0412 345" with the caret just after the space, Backspace pressed:
    // the browser hands back "0412345" — digits unchanged.
    expect(resolveDeletion("0412345", 4, "0412 345")).toEqual({
      raw: "041345",
      caret: 3,
    });
  });

  it("leaves an ordinary digit deletion alone", () => {
    expect(resolveDeletion("0412 34", 7, "0412 345")).toEqual({
      raw: "0412 34",
      caret: 7,
    });
  });

  it("does not treat removing a leading + as removing formatting", () => {
    expect(resolveDeletion("61 4", 0, "+61 4")).toEqual({ raw: "61 4", caret: 0 });
  });

  it("does nothing when an insertion made the text longer", () => {
    expect(resolveDeletion("04123", 5, "0412")).toEqual({ raw: "04123", caret: 5 });
  });
});

describe("caret", () => {
  it("stays at the end when typing at the end", () => {
    expect(caretAfterFormatting("0412345", 7, "0412 345")).toBe(8);
  });

  it("stays after the same digit when editing in the middle", () => {
    // Typed a digit after the 2nd digit of "0412 345 678"; formatting may move
    // spaces around it, but the caret should still follow that digit.
    expect(caretAfterFormatting("04112 345 678", 3, "0411 234 5678")).toBe(3);
    expect(caretAfterFormatting("04123 45678", 5, "0412 345 678")).toBe(6);
  });

  it("goes to the very end when a pasted dial code left the field", () => {
    expect(caretAfterFormatting("+61 412 345 678", 15, "0412 345 678")).toBe(12);
  });
});

describe("limits", () => {
  it("flags more digits than any phone number can have", () => {
    expect(exceedsMaxDigits("1234567890123456")).toBe(true);
    expect(exceedsMaxDigits("123456789012345")).toBe(false);
  });
});
