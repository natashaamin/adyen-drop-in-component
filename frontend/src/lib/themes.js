// Sets CSS custom properties from Adyen's UI Customization API on the Drop-in
// mount node. Variable names confirmed against @adyen/adyen-web/dist/es/adyen.css.
function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.substring(0, 2), 16);
    const g = parseInt(value.substring(2, 4), 16);
    const b = parseInt(value.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTheme(accent) {
    return {
        "--adyen-sdk-color-background-always-dark": accent,
        "--adyen-sdk-color-background-always-dark-active": accent,
        "--adyen-sdk-color-background-inverse-primary-hover": accent,
        "--adyen-sdk-color-label-primary": accent,
        "--adyen-sdk-color-outline-primary-active": accent,
        "--adyen-sdk-focus-ring-color": hexToRgba(accent, 0.5)
    };
}

export const THEMES = {
    default: { label: "Adyen (default)", swatch: "#00112c", vars: null },
    black: { label: "Black", swatch: "#000000", vars: buildTheme("#000000") },
    blue: { label: "Blue", swatch: "#0070f5", vars: buildTheme("#0070f5") },
    purple: { label: "Purple", swatch: "#6d28d9", vars: buildTheme("#6d28d9") },
    green: { label: "Green", swatch: "#0a7d3f", vars: buildTheme("#0a7d3f") }
};

export function applyTheme(domNode, themeKey) {
    const theme = THEMES[themeKey] ?? THEMES.default;
    const vars = theme.vars ?? {};
    // Clear previous theme vars before applying the new one so switching
    // back to "default" doesn't leave stale overrides in place.
    Object.values(THEMES).forEach((t) => {
        if (!t.vars) return;
        Object.keys(t.vars).forEach((key) => domNode.style.removeProperty(key));
    });
    Object.entries(vars).forEach(([key, value]) => domNode.style.setProperty(key, value));
}
