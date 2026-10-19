/* global describe, it */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Run directly with Node or through the existing Grunt/Mocha unit suite.
const suite = typeof describe === "function" ? describe : (name, run) => run();
const test = typeof it === "function" ? it : (name, run) => {
    run();
    console.log("PASS: " + name);
};

function submit(body) {
    const updates = [];
    const renders = [];
    const marker = {
        executed: false
    };
    const sandbox = {
        module: {
            exports: {}
        },
        marker,
        require: name => {
            if (name === "../data/contributions-dao") {
                return {
                    ContributionsDAO: function() {
                        this.update = (userId, preTax, afterTax, roth, callback) => {
                            const values = {
                                userId,
                                preTax,
                                afterTax,
                                roth
                            };
                            updates.push(values);
                            callback(null, values);
                        };
                    }
                };
            }
            assert.strictEqual(name, "../../config/config");
            return {
                environmentalScripts: ""
            };
        }
    };
    const filename = path.join(__dirname, "../../app/routes/contributions.js");
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, {
        filename
    });
    const handler = new sandbox.module.exports({});
    handler.handleContributionsUpdate({
        body,
        session: {
            userId: 123
        }
    }, {
        render: (view, data) => renders.push({
            view,
            data
        })
    }, error => {
        throw error;
    });
    assert.strictEqual(renders.length, 1);
    assert.strictEqual(renders[0].view, "contributions");
    assert.strictEqual(marker.executed, false, "Input must never execute JavaScript");
    return {
        updates,
        data: renders[0].data
    };
}

suite("Contribution percentage validation", () => {
    [
        ["0", "0", "0"],
        ["10", "10", "10"],
        ["2.5", "10.25", "0.25"],
        [" 10 ", "\t2.5\n", "0"]
    ].forEach(values => {
        test("persists numeric percentages for " + JSON.stringify(values), () => {
            const [preTax, afterTax, roth] = values;
            const result = submit({
                preTax,
                afterTax,
                roth
            });
            assert.strictEqual(result.updates.length, 1);
            assert.deepStrictEqual(result.updates[0], {
                userId: 123,
                preTax: Number(preTax),
                afterTax: Number(afterTax),
                roth: Number(roth),
                updateSuccess: true
            });
            assert.strictEqual(result.data.updateSuccess, true);
        });
    });

    ["preTax", "afterTax", "roth"].forEach(field => {
        test("rejects malformed and executable values in " + field + " without persisting", () => {
            const invalid = [
                "", " ", "-1", "+1", "01", ".5", "1.", "1e1", "0x10", "2.5%", "1 2",
                "NaN", "Infinity", "9".repeat(400), "1+1", "1; marker.executed = true",
                "(marker.executed = true, 1)", "1\\d", "0\\d\\x\\d",
                undefined, null, true, false, 1, NaN, Infinity, [],
                ["1"], {}, {
                    value: "1"
                }
            ];
            invalid.forEach(value => {
                const body = {
                    preTax: "1",
                    afterTax: "1",
                    roth: "1"
                };
                body[field] = value;
                const result = submit(body);
                assert.strictEqual(result.updates.length, 0, "Rejected value: " + String(value));
                assert.strictEqual(result.data.updateError, "Invalid contribution percentages");
            });
        });

        test("enforces the 30 percent total when increasing " + field, () => {
            const body = {
                preTax: "10",
                afterTax: "10",
                roth: "10"
            };
            body[field] = "10.01";
            const result = submit(body);
            assert.strictEqual(result.updates.length, 0);
            assert.strictEqual(result.data.updateError, "Contribution percentages cannot exceed 30 %");
        });
    });
});
