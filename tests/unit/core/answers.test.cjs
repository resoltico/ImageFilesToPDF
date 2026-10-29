"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readAnswers, answersFromSettings, readNumber } = require("../../../src/host/settings-model.js");
const { defaultAnswers, formSpec } = require("../../../src/host/settings-model.js");
const { DEFAULT_SETTINGS, validateSettings } = require("../../../src/core/settings.js");
const { RESOLUTION, QUALITY } = require("../../../src/host/settings-model.js");

test("GUI and canonical JSON share values and issue codes", () => {
    assert.deepEqual(readAnswers(defaultAnswers()).settings, DEFAULT_SETTINGS);
    assert.deepEqual(answersFromSettings(DEFAULT_SETTINGS), defaultAnswers());
    const gui = readAnswers({...defaultAnswers(),resolutionLimit:"1018",quality:"0",background:"purple",paperSize:"Legal"});
    const json = validateSettings({...DEFAULT_SETTINGS,resolutionLimit:1018,quality:0,background:"purple",paperSize:"Legal"});
    assert.deepEqual(gui.problems.map(({field,code})=>({field,code})),json.issues.map(({field,code})=>({field,code})));
    assert.equal(gui.problems.length,4);
});

for (const resolutionLimit of ["", " ", "abc", "300abc", "abc300", "1e3", "300.5", "-5", "0x10"]) {
    test(`GUI numeric lexical refusal ${JSON.stringify(resolutionLimit)}`, () => {
        assert.equal(readAnswers({...defaultAnswers(),resolutionLimit}).problems[0].code,"integer");
        assert.throws(()=>readNumber(resolutionLimit,RESOLUTION),/Maximum resolution/u);
    });
}

test("numeric boundaries and colour normalization pass unchanged", () => {
    for (const resolutionLimit of ["72","1017"," 600 "]) { assert.ok(readAnswers({...defaultAnswers(),resolutionLimit}).settings); }
    for (const quality of ["1","100"]) { assert.ok(readAnswers({...defaultAnswers(),quality}).settings); }
    assert.equal(readAnswers({...defaultAnswers(),background:" c7dae8 "}).settings.background,"#C7DAE8");
    assert.throws(()=>readNumber("101",QUALITY),/JPEG quality/u);
});

test("canonical popup values round trip without label transport", () => {
    for (const row of formSpec().rows.filter((entry)=>entry.options)) {
        for (const option of row.options) {
            const result=readAnswers({...defaultAnswers(),[row.key]:option.value??option.label});
            assert.ok(result.settings,JSON.stringify(option));
        }
    }
    assert.equal(readAnswers({...defaultAnswers(),paperSize:"US Letter"}).problems[0].code,"choice");
});
