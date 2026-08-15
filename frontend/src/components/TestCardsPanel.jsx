import { useState } from "react";

// All numbers verified against https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers
const TEST_CARDS = [
    {
        scenario: "Authorised — no 3DS",
        cards: [
            { brand: "Visa",       number: "4111 1111 1111 1111", expiry: "03/30", cvc: "737" },
            { brand: "Mastercard", number: "5555 5555 5555 4444", expiry: "03/30", cvc: "737" },
            { brand: "Amex",       number: "3700 0000 0000 002",  expiry: "03/30", cvc: "7373" },
        ]
    },
    {
        scenario: "3DS2 — challenge",
        note: 'OTP modal appears — type "password"',
        cards: [
            { brand: "Visa",       number: "4917 6100 0000 0000", expiry: "03/30", cvc: "737" },
            { brand: "Mastercard", number: "5454 5454 5454 5454", expiry: "03/30", cvc: "737" },
        ]
    },
];

const REFUSED_TIP = 'To test a refused payment, use any card above and type DECLINED as the cardholder name.';

function CopyChip({ label, value, id, copied, onCopy }) {
    const active = copied === id;
    return (
        <button
            type="button"
            className={`tc-chip ${active ? "tc-chip--copied" : ""}`}
            onClick={() => onCopy(value, id)}
            title={`Click to copy ${label}`}
        >
            {active ? "Copied!" : value}
        </button>
    );
}

export default function TestCardsPanel() {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(null);

    function copy(value, id) {
        navigator.clipboard.writeText(value.replace(/\s/g, ""));
        setCopied(id);
        setTimeout(() => setCopied(null), 1500);
    }

    return (
        <>
            {open && <div className="tc-backdrop" onClick={() => setOpen(false)} />}

            <div className="tc-root">
                {open && (
                    <div className="tc-panel">
                        <div className="tc-panel-header">
                            <span>Test cards</span>
                            <button className="tc-close" onClick={() => setOpen(false)}>✕</button>
                        </div>
                        <p className="tc-hint">Click any value to copy it to your clipboard.</p>

                        {TEST_CARDS.map((group) => (
                            <div key={group.scenario} className="tc-group">
                                <p className="tc-scenario">{group.scenario}</p>
                                {group.note && <p className="tc-note">{group.note}</p>}
                                {group.cards.map((card) => (
                                    <div key={card.number} className="tc-card">
                                        <span className="tc-brand">{card.brand}</span>
                                        <div className="tc-chips">
                                            <CopyChip label="card number" value={card.number} id={`num-${card.number}`} copied={copied} onCopy={copy} />
                                            <CopyChip label="expiry"      value={card.expiry} id={`exp-${card.number}`} copied={copied} onCopy={copy} />
                                            <CopyChip label="CVC"         value={card.cvc}    id={`cvc-${card.number}`} copied={copied} onCopy={copy} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}

                        <div className="tc-group tc-group--tip">
                            <p className="tc-scenario">Refused</p>
                            <p className="tc-note">{REFUSED_TIP}</p>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    className="tc-bubble"
                    onClick={() => setOpen((v) => !v)}
                    title="Test cards"
                    aria-label="Open test cards"
                >
                    💳
                </button>
            </div>
        </>
    );
}
