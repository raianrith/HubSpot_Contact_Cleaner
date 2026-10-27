import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanAddress, cleanPostal, cleanState } from "../lib/addresses";
import { cleanRecords } from "../lib/clean";
import { standardizeCompanies } from "../lib/companies";
import { DEMO_HEADERS, DEMO_ROWS } from "../lib/demo-data";
import { detectColumns } from "../lib/detect";
import { assessEmail, cleanEmail, domainCounts, emailMatchesName } from "../lib/emails";
import { cleanPersonName } from "../lib/names";
import { cleanPhone } from "../lib/phones";
import { defaultOptions } from "../lib/types";

describe("names", () => {
  it("fixes casing, initials, and surnames", () => {
    assert.equal(cleanPersonName("CARSON").value, "Carson");
    assert.equal(cleanPersonName("duffy").value, "Duffy");
    assert.equal(cleanPersonName("O'brien").value, "O'Brien");
    assert.equal(cleanPersonName("McDONALD").value, "McDonald");
    assert.equal(cleanPersonName("Van Den Heuvel").value, "Van Den Heuvel");
    assert.equal(cleanPersonName("CJ").value, "CJ");
    assert.equal(cleanPersonName("J.R.").value, "J.R.");
    assert.equal(cleanPersonName("  Michael").value, "Michael");
    assert.equal(cleanPersonName("BALL, CARSON").value, "Carson Ball");
    assert.equal(cleanPersonName("NULL").value, "");
    assert.equal(cleanPersonName("N/A").value, "");
  });
});

describe("companies", () => {
  it("formats legal names and keeps short brands", () => {
    const pass = standardizeCompanies(
      [
        "Amcor FLexibles",
        "KIMBERLY CLARK",
        "Kimberly-Clark",
        "Kimberly Clark",
        "First Quality Tissue. LLC",
        "YMCA",
        "CLeveland-Cliffs Inc.",
        "Cleveland Cliffs Inc",
        "Andritz",
        "Andritz Inc.",
        "Georgia Pacific",
        "Georgia Pacific - Monticello",
        "Pratt Paper (OH), LLC",
        "Pratt Paper (IN), LLC",
        "F.N. Sheppard & Co.",
        "A.P Nonweiler Company",
        "US MGO",
        "Jamar Company",
        "Jamar - Escanaba",
        "Merck & Co. Inc",
      ],
      true,
    );
    const at = (index: number) => pass.values[index];
    assert.equal(at(0), "Amcor Flexibles");
    assert.equal(at(1), at(2));
    assert.equal(at(2), at(3));
    assert.match(at(1), /Kimberly[- ]Clark/);
    assert.equal(at(4), "First Quality Tissue, LLC");
    assert.equal(at(5), "YMCA");
    assert.equal(at(6), "Cleveland-Cliffs Inc.");
    assert.equal(at(7), "Cleveland-Cliffs Inc.");
    assert.equal(at(8), "Andritz Inc.");
    assert.equal(at(9), "Andritz Inc.");
    assert.equal(at(10), "Georgia Pacific");
    assert.equal(at(11), "Georgia Pacific - Monticello");
    assert.equal(at(12), "Pratt Paper (OH), LLC");
    assert.equal(at(13), "Pratt Paper (IN), LLC");
    assert.equal(at(14), "F.N. Sheppard & Co.");
    assert.equal(at(15), "A.P. Nonweiler Company");
    assert.equal(at(16), "US MGO");
    assert.equal(at(17), "Jamar Company");
    assert.equal(at(18), "Jamar - Escanaba");
    assert.equal(at(19), "Merck & Co., Inc.");
  });
});

describe("emails and phones", () => {
  it("corrects safe email problems and flags the rest", () => {
    const counts = domainCounts([
      "a@gapac.com",
      "b@gapac.com",
      "c@gapac.com",
      "d@gapac.com",
      "e@gapac.com",
      "f@billerud.com",
      "g@billerud.com",
      "h@billerud.com",
      "i@billerud.com",
      "j@billerud.com",
      "k@billerud.com",
      "l@billerud.com",
      "m@billerud.com",
      "n@billerud.com",
    ]);
    assert.equal(cleanEmail("Ryan moore@billerud.com", counts).value, "ryan.moore@billerud.com");
    assert.equal(cleanEmail("Alan.hart@billerud .com", counts).value, "alan.hart@billerud.com");
    assert.equal(cleanEmail("michael,glish@billerud.com", counts).value, "michael.glish@billerud.com");
    assert.equal(cleanEmail("person@gmial.com", counts).value, "person@gmail.com");
    const bare = assessEmail("clevelandcliffs.com", { first: "", last: "" }, counts);
    assert.equal(bare[0]?.code, "invalid_email");
    const doubled = assessEmail("jerold@melius@wthg.com", { first: "Jerold", last: "Melius" }, counts);
    assert.equal(doubled[0]?.code, "invalid_email");
    assert.equal(emailMatchesName("abruck@kcc.com", "Matthew", "Waite"), "mismatch");
    assert.equal(emailMatchesName("cfahrbch@kcc.com", "Chris", "Fahrbach"), "typo");
    assert.equal(emailMatchesName("carson.ball@gapac.com", "Carson", "Ball"), "match");
    const popular = domainCounts(Array.from({ length: 16 }, (_, index) => `person${index}@gapac.com`));
    assert.equal(cleanEmail("roberta.richardson@gapacom", popular).value, "roberta.richardson@gapac.com");
  });

  it("formats US phones and keeps extensions", () => {
    assert.equal(cleanPhone("864-760-7201", "national").value, "(864) 760-7201");
    assert.equal(cleanPhone("740.808.4003", "national").value, "(740) 808-4003");
    assert.equal(cleanPhone("920.241.0011 ext 12", "national").value, "(920) 241-0011 ext. 12");
    assert.equal(cleanPhone("864-760-7201", "e164").value, "+18647607201");
    assert.equal(cleanPhone("920-369-898", "national").value, "920-369-898");
    assert.equal(cleanPhone("55-19-3407-3787", "national").value, "+551934073787");
  });
});

describe("places", () => {
  it("standardizes states, streets, and ZIP codes", () => {
    assert.equal(cleanState("wisconsin", "abbr").value, "WI");
    assert.equal(cleanState("Wis.", "abbr").value, "WI");
    assert.equal(cleanState("WI", "full").value, "Wisconsin");
    assert.equal(cleanAddress("123 north main street").value, "123 N Main St");
    assert.equal(cleanAddress("9 oak avenue suite 4").value, "9 Oak Ave Ste 4");
    assert.equal(cleanAddress("P.O. Box 12").value, "PO Box 12");
    assert.equal(cleanPostal("5401").value, "05401");
    assert.equal(cleanPostal("543016789").value, "54301-6789");
    assert.equal(cleanPostal("k1a0b1").value, "K1A 0B1");
  });
});

describe("workbook cleaning", () => {
  it("detects the sample-style headers and cleans the demo list", () => {
    const mappings = detectColumns(DEMO_HEADERS, DEMO_ROWS);
    const kinds = Object.fromEntries(mappings.map((mapping) => [mapping.header, mapping.kind]));
    assert.equal(kinds.CustNo, "id");
    assert.equal(kinds.Customer, "company");
    assert.equal(kinds.CustContacFirst, "first_name");
    assert.equal(kinds.CustContactLst, "last_name");
    assert.equal(kinds.CustomerContactEmail, "email");
    assert.equal(kinds.CustomerPhone, "phone");
    assert.equal(kinds.State, "state");
    assert.equal(kinds["Postal Code"], "postal_code");
    assert.equal(kinds["Job Title"], "job_title");

    const result = cleanRecords(DEMO_HEADERS, DEMO_ROWS, DEMO_ROWS.map((_, index) => index + 2), mappings, defaultOptions);
    assert.deepEqual(result.headers, DEMO_HEADERS);
    assert.equal(result.rows.length, DEMO_ROWS.length);
    const email = result.rows.map((row) => row[4]);
    assert.ok(email.includes("ryan.moore@billerud.com"));
    assert.ok(email.includes("alan.hart@billerud.com"));
    assert.equal(result.rows[0][2], "Carson");
    assert.equal(result.rows[0][5], "(864) 760-7201");
    assert.equal(result.rows[0][8], "WI");
    assert.equal(result.rows[0][10], "VP of Sales");
    assert.equal(result.rows[4][9], "05401");
    assert.ok(result.kpis.invalidEmails >= 2);
    assert.ok(result.kpis.duplicateGroups >= 2);
    assert.ok(result.kpis.cellsChanged > 10);
    const matthew = result.duplicates.find((group) => group.rowIndexes.includes(2));
    assert.ok(matthew);
    assert.ok(matthew.conflicts.some((conflict) => conflict.includes("Email")));
    assert.equal(result.rows[3][4], "", "a mismatched email is not copied onto the blank duplicate");
    assert.equal(result.rows[11][1], "Pratt Paper (OH), LLC");
    assert.equal(result.rows[12][1], "Pratt Paper (IN), LLC");
  });
});
