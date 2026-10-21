/* global describe, it */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Exercise the real route handler without a database or application server.
function createHandler(updateError) {
    const updates = [];
    const renders = [];
    const errors = [];
    const sandbox = {
        module: {
            exports: {}
        },
        require: name => {
            if (name === "../data/contributions-dao") {
                return {
                    ContributionsDAO: function() {
                        this.update = (userId, preTax, afterTax, roth, callback) => {
                            updates.push({
                                userId,
                                preTax,
                                afterTax,
                                roth
                            });
                            callback(updateError, {
                                userId,
                                preTax,
                                afterTax,
                                roth
                            });
                        };
                    }
                };
            }
            if (name === "../../config/config") {
                return {
                    environmentalScripts: "test-scripts"
                };
            }
            throw new Error("Unexpected dependency: " + name);
        }
    };
    sandbox.global = sandbox;
    const filename = path.join(__dirname, "../../app/routes/contributions.js");
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, {
        filename
    });
    const handler = new sandbox.module.exports({});

    return {
        sandbox,
        updates,
        renders,
        errors,
        submit: body => handler.handleContributionsUpdate({
                body,
                session: {
                    userId: 7
                }
            }, {
                render: (view, data) => renders.push({
                    view,
                    data
                })
            },
            error => errors.push(error)
        )
    };
}

describe("Contribution percentage validation", function() {
    [
        ["0", "0", "0"],
        ["12", "0", "0"],
        ["10", "10", "10"],
        ["2.5", "0.25", "1.125"],
        [" 10 ", "\t2.5\n", "0"]
    ].forEach(values => {
        it("persists valid percentages " + JSON.stringify(values), function() {
            const fixture = createHandler();
            fixture.submit({
                preTax: values[0],
                afterTax: values[1],
                roth: values[2]
            });
            assert.deepStrictEqual(fixture.updates, [{
                userId: 7,
                preTax: Number(values[0]),
                afterTax: Number(values[1]),
                roth: Number(values[2])
            }]);
            assert.strictEqual(fixture.renders.length, 1);
            assert.strictEqual(fixture.renders[0].view, "contributions");
            assert.strictEqual(fixture.renders[0].data.updateSuccess, true);
            assert.strictEqual(fixture.renders[0].data.environmentalScripts, "test-scripts");
            assert.deepStrictEqual(fixture.errors, []);
        });
    });

    const invalidValues = [
        "", " ", "NaN", "Infinity", "-Infinity", "-1", "1e1", "0x10", "1+1", "10%", "2.5junk",
        "01", ".5", "1.", "1\\d", "0\\.\\d", "9".repeat(400),
        undefined, null, 2, true, ["2"], {
            value: "2"
        },
        "global.contributionPayloadExecuted = true",
        "(function() { global.contributionPayloadExecuted = true; return 1; })()"
    ];
    ["preTax", "afterTax", "roth"].forEach(field => {
        invalidValues.forEach(value => {
            it("rejects " + field + " = " + JSON.stringify(value), function() {
                const fixture = createHandler();
                const body = {
                    preTax: "0",
                    afterTax: "0",
                    roth: "0"
                };
                body[field] = value;
                fixture.submit(body);
                assert.strictEqual(fixture.sandbox.contributionPayloadExecuted, undefined);
                assert.deepStrictEqual(fixture.updates, []);
                assert.deepStrictEqual(fixture.errors, []);
                assert.strictEqual(fixture.renders.length, 1);
                assert.strictEqual(fixture.renders[0].data.updateError, "Invalid contribution percentages");
                assert.strictEqual(fixture.renders[0].data.userId, 7);
            });
        });
    });

    [
        ["31", "0", "0"],
        ["10", "10", "10.01"],
        ["0", "31", "0"],
        ["0", "0", "31"]
    ].forEach(values => {
        it("rejects totals above 30: " + JSON.stringify(values), function() {
            const fixture = createHandler();
            fixture.submit({
                preTax: values[0],
                afterTax: values[1],
                roth: values[2]
            });
            assert.deepStrictEqual(fixture.updates, []);
            assert.strictEqual(fixture.renders[0].data.updateError, "Contribution percentages cannot exceed 30 %");
        });
    });

    it("forwards database failures to the error handler", function() {
        const error = new Error("Database unavailable");
        const fixture = createHandler(error);
        fixture.submit({
            preTax: "10",
            afterTax: "0",
            roth: "0"
        });
        assert.deepStrictEqual(fixture.errors, [error]);
        assert.deepStrictEqual(fixture.renders, []);
    });
});
