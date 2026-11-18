import { describe, expect, it } from "vitest";

import {
  depreciationAmountError,
  depreciationErrors,
  disposalDateError,
  effectiveLifeError,
  emailError,
  insuranceAmountError,
  insuranceEndDateError,
  insuranceErrors,
  isValidIsoDate,
  localIsoToday,
  nonNegativeAmountError,
  overrideRateError,
  parseTypedNumber,
  phoneError,
  requiredError,
  residualVsCostLimitError,
  saleValueError,
  stripNonPhoneChars,
  typedNumberForApi,
} from "@/lib/asset-validation";

describe("parseTypedNumber", () => {
  it("reads blank as null, junk as NaN, and ignores thousands commas", () => {
    expect(parseTypedNumber("")).toBeNull();
    expect(parseTypedNumber("   ")).toBeNull();
    expect(parseTypedNumber("1,250.50")).toBe(1250.5);
    expect(parseTypedNumber("-3")).toBe(-3);
    expect(parseTypedNumber(".5")).toBe(0.5);
    expect(parseTypedNumber("abc")).toBeNaN();
    expect(parseTypedNumber("1e3")).toBeNaN();
    expect(parseTypedNumber("12.3.4")).toBeNaN();
  });
});

describe("typedNumberForApi", () => {
  it("sends a plain number string, whatever separators were typed", () => {
    expect(typedNumberForApi("1,250.50")).toBe("1250.5");
    expect(typedNumberForApi(" 1,000 ")).toBe("1000");
    expect(typedNumberForApi("0")).toBe("0");
  });

  it("keeps blank blank, and junk comma-stripped for the server to reject", () => {
    expect(typedNumberForApi("")).toBe("");
    expect(typedNumberForApi("   ")).toBe("");
    expect(typedNumberForApi(undefined)).toBe("");
    expect(typedNumberForApi("12,3a")).toBe("123a");
  });
});

describe("isValidIsoDate", () => {
  it("accepts a real calendar date written YYYY-MM-DD", () => {
    expect(isValidIsoDate("2026-03-15")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects other shapes and impossible dates", () => {
    expect(isValidIsoDate("15/03/2026")).toBe(false);
    expect(isValidIsoDate("2026-3-15")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });
});

describe("localIsoToday", () => {
  it("formats the local calendar day, not UTC", () => {
    // 11:30pm local on 4 Nov is still 4 Nov, whatever UTC says.
    expect(localIsoToday(new Date(2026, 10, 4, 23, 30))).toBe("2026-11-04");
    expect(localIsoToday(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

describe("disposal", () => {
  const today = "2026-11-04";

  it("requires a disposal date", () => {
    expect(disposalDateError("", today)).toBe("Disposed date is required");
  });

  it("accepts today and the past, rejects tomorrow", () => {
    expect(disposalDateError("2026-11-04", today)).toBeNull();
    expect(disposalDateError("2026-11-03", today)).toBeNull();
    expect(disposalDateError("2020-01-01", today)).toBeNull();
    expect(disposalDateError("2026-11-05", today)).toBe(
      "Disposal date can't be in the future",
    );
    expect(disposalDateError("2027-01-01", today)).toBe(
      "Disposal date can't be in the future",
    );
  });

  it("defaults to the local today", () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    expect(disposalDateError(localIsoToday(now))).toBeNull();
    expect(disposalDateError(localIsoToday(tomorrow))).not.toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(disposalDateError("04/11/2026", today)).toBe("Enter a valid date");
  });

  it("rejects a date before the purchase date, and allows the same day", () => {
    expect(disposalDateError("2026-02-28", today, "2026-03-01")).toBe(
      "Disposal date can't be before the purchase date",
    );
    expect(disposalDateError("2026-03-01", today, "2026-03-01")).toBeNull();
    expect(disposalDateError("2026-06-01", today, "2026-03-01")).toBeNull();
    // No (or no usable) purchase date: nothing to compare against.
    expect(disposalDateError("2020-01-01", today, "")).toBeNull();
  });

  it("takes a blank, zero or positive sale value, but not a negative or junk", () => {
    expect(saleValueError("")).toBeNull();
    expect(saleValueError("0")).toBeNull();
    expect(saleValueError("0.01")).toBeNull();
    expect(saleValueError("1,500")).toBeNull();
    expect(saleValueError("-0.01")).toBe("Must be 0 or greater");
    expect(saleValueError("abc")).toBe("Sale value must be a valid number");
  });

  it("nonNegativeAmountError names the field in the not-a-number message", () => {
    expect(nonNegativeAmountError("x", "Thing")).toBe("Thing must be a valid number");
  });
});

describe("depreciation amounts", () => {
  it("allows blank, zero and exactly the asset value", () => {
    expect(depreciationAmountError("", "Residual value", 1000)).toBeNull();
    expect(depreciationAmountError("0", "Residual value", 1000)).toBeNull();
    expect(depreciationAmountError("1000", "Residual value", 1000)).toBeNull();
    expect(depreciationAmountError("1000", "Cost limit", 1000)).toBeNull();
  });

  it("rejects a cent over the asset value", () => {
    expect(depreciationAmountError("1000.01", "Residual value", 1000)).toBe(
      "Residual value cannot be greater than asset value",
    );
    expect(depreciationAmountError("1000.01", "Cost limit", 1000)).toBe(
      "Cost limit cannot be greater than asset value",
    );
  });

  it("caps at the ex-GST cost to the cent", () => {
    const exGst = 1000 - 1000 / 11; // 909.0909…
    expect(depreciationAmountError("909.09", "Residual value", exGst)).toBeNull();
    expect(depreciationAmountError("909.10", "Residual value", exGst)).toBe(
      "Residual value cannot be greater than asset value",
    );
  });

  it("rejects negatives and junk", () => {
    expect(depreciationAmountError("-1", "Residual value", 1000)).toBe(
      "Must be 0 or greater",
    );
    expect(depreciationAmountError("-0.01", "Cost limit", 1000)).toBe(
      "Must be 0 or greater",
    );
    expect(depreciationAmountError("ten", "Cost limit", 1000)).toBe(
      "Cost limit must be a valid number",
    );
  });

  it("skips the cap when there's no asset value to compare with", () => {
    expect(depreciationAmountError("5000", "Residual value", null)).toBeNull();
    expect(depreciationAmountError("-1", "Residual value", null)).toBe(
      "Must be 0 or greater",
    );
  });

  it("wants the residual below the cost limit when both are given", () => {
    expect(residualVsCostLimitError("100", "200")).toBeNull();
    expect(residualVsCostLimitError("199.99", "200")).toBeNull();
    expect(residualVsCostLimitError("200", "200")).toBe(
      "Residual value must be less than the cost limit",
    );
    expect(residualVsCostLimitError("250", "200")).toBe(
      "Residual value must be less than the cost limit",
    );
    // Either one missing, unreadable, or a zero (no) limit: nothing to compare.
    expect(residualVsCostLimitError("", "200")).toBeNull();
    expect(residualVsCostLimitError("100", "")).toBeNull();
    expect(residualVsCostLimitError("100", "abc")).toBeNull();
    expect(residualVsCostLimitError("0", "0")).toBeNull();
  });
});

describe("effective life", () => {
  it("is required and above zero", () => {
    expect(effectiveLifeError("", false)).toBe("Effective life is required");
    expect(effectiveLifeError("0", false)).toBe("Minimum 6 months");
    expect(effectiveLifeError("-2", false)).toBe("Minimum 6 months");
    expect(effectiveLifeError("0.4", false)).toBe("Minimum 6 months");
    expect(effectiveLifeError("five", false)).toBe("Effective life must be a number");
    expect(effectiveLifeError("0.5", false)).toBeNull();
    expect(effectiveLifeError("5", false)).toBeNull();
  });

  it("isn't needed for a full write-off", () => {
    expect(effectiveLifeError("", true)).toBeNull();
    expect(effectiveLifeError("0", true)).toBeNull();
  });
});

describe("override rate", () => {
  it("is optional and runs 0 to 100 inclusive", () => {
    expect(overrideRateError("")).toBeNull();
    expect(overrideRateError("0")).toBeNull();
    expect(overrideRateError("37.5")).toBeNull();
    expect(overrideRateError("100")).toBeNull();
    expect(overrideRateError("100.01")).toBe("Override rate must be between 0 and 100");
    expect(overrideRateError("-0.01")).toBe("Override rate must be between 0 and 100");
    expect(overrideRateError("abc")).toBe("Override rate must be a number");
  });
});

describe("depreciationErrors", () => {
  const blank = { effectiveLife: "5", overrideRate: "", residualValue: "", costLimit: "" };
  const options = { assetValue: 1000, fullWriteOff: false, overrideRateApplies: true };

  it("is empty for valid settings", () => {
    expect(depreciationErrors(blank, options)).toEqual({});
    expect(
      depreciationErrors(
        { effectiveLife: "5", overrideRate: "40", residualValue: "100", costLimit: "900" },
        options,
      ),
    ).toEqual({});
  });

  it("keys each problem by field", () => {
    expect(
      depreciationErrors(
        { effectiveLife: "", overrideRate: "120", residualValue: "1500", costLimit: "-1" },
        options,
      ),
    ).toEqual({
      effectiveLife: "Effective life is required",
      overrideRate: "Override rate must be between 0 and 100",
      residualValue: "Residual value cannot be greater than asset value",
      costLimit: "Must be 0 or greater",
    });
  });

  it("flags a residual at or above the cost limit on the residual field", () => {
    expect(
      depreciationErrors({ ...blank, residualValue: "500", costLimit: "500" }, options),
    ).toEqual({ residualValue: "Residual value must be less than the cost limit" });
  });

  it("ignores the override rate where it doesn't apply, and life on a write-off", () => {
    expect(
      depreciationErrors(
        { ...blank, effectiveLife: "", overrideRate: "500" },
        { ...options, fullWriteOff: true, overrideRateApplies: false },
      ),
    ).toEqual({});
  });
});

describe("insurance", () => {
  const valid = {
    insurerName: "Allianz",
    policyNumber: "POL-1",
    insurerEmail: "",
    brokerPhone: "",
    coverageAmount: "5000",
    premiumAmount: "",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  };

  it("names the required field", () => {
    expect(requiredError("", "Policy number")).toBe("Policy number is required");
    expect(requiredError("  ", "Policy number")).toBe("Policy number is required");
    expect(requiredError("x", "Policy number")).toBeNull();
  });

  it("requires insurer, policy, coverage, start and end", () => {
    expect(insuranceErrors(valid)).toEqual({});
    expect(
      insuranceErrors({
        ...valid,
        insurerName: "",
        policyNumber: " ",
        coverageAmount: "",
        startDate: "",
        endDate: "",
      }),
    ).toEqual({
      insurerName: "Insurer name is required",
      policyNumber: "Policy number is required",
      coverageAmount: "Coverage amount is required",
      startDate: "Start date is required",
      endDate: "End date is required",
    });
  });

  it("accepts an end date on or after the start, not before", () => {
    expect(insuranceEndDateError("2026-01-01", "2026-01-01")).toBeNull();
    expect(insuranceEndDateError("2026-01-01", "2026-01-02")).toBeNull();
    expect(insuranceEndDateError("2026-01-02", "2026-01-01")).toBe(
      "End date must be on or after the start date",
    );
    expect(insuranceEndDateError("", "2026-01-01")).toBeNull();
    expect(insuranceErrors({ ...valid, endDate: "2025-12-31" })).toEqual({
      endDate: "End date must be on or after the start date",
    });
  });

  it("checks the email format only when one is given", () => {
    expect(emailError("")).toBeNull();
    expect(emailError("claims@insurer.com.au")).toBeNull();
    expect(emailError(" claims@insurer.com ")).toBeNull();
    expect(emailError("claims@insurer")).toBe("Enter a valid email address");
    expect(emailError("claims insurer.com")).toBe("Enter a valid email address");
    expect(insuranceErrors({ ...valid, insurerEmail: "nope" })).toEqual({
      insurerEmail: "Enter a valid email address",
    });
  });

  it("wants 7–15 digits in a phone number, separators aside", () => {
    const message = "Enter a valid phone number (7–15 digits)";
    expect(phoneError("")).toBeNull();
    expect(phoneError("123456")).toBe(message); // 6
    expect(phoneError("1234567")).toBeNull(); // 7
    expect(phoneError("123456789012345")).toBeNull(); // 15
    expect(phoneError("1234567890123456")).toBe(message); // 16
    expect(phoneError("+61 (04) 12-345-678")).toBeNull();
    expect(phoneError("(02) 9")).toBe(message);
    expect(phoneError("0412 345 678x")).toBe(message);
    expect(insuranceErrors({ ...valid, brokerPhone: "12" })).toEqual({
      brokerPhone: message,
    });
  });

  it("filters characters a phone number can't contain as it's typed", () => {
    expect(stripNonPhoneChars("+61 (04) 12-345.678")).toBe("+61 (04) 12-345.678");
    expect(stripNonPhoneChars("04a12#345b678")).toBe("0412345678");
  });

  it("wants coverage and premium as numbers of 0 or more", () => {
    expect(insuranceAmountError("", "Premium amount")).toBeNull();
    expect(insuranceAmountError("0", "Coverage amount")).toBeNull();
    expect(insuranceAmountError("1,000.50", "Coverage amount")).toBeNull();
    expect(insuranceAmountError("-0.01", "Coverage amount")).toBe(
      "Coverage amount must be a valid non-negative number",
    );
    expect(insuranceAmountError("abc", "Premium amount")).toBe(
      "Premium amount must be a valid non-negative number",
    );
    expect(insuranceErrors({ ...valid, coverageAmount: "-5", premiumAmount: "x" })).toEqual({
      coverageAmount: "Coverage amount must be a valid non-negative number",
      premiumAmount: "Premium amount must be a valid non-negative number",
    });
  });
});
