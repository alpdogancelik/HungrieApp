/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        fontFamily: {
            sans: ["ChairoSans", "sans-serif"],
        },
        extend: {
            colors: {
                primary: "#FE8C00",
                "primary-dark": "#E56E00",
                secondary: "#FFD36B",
                accent: "#12B886",
                dark: {
                    100: "#0F172A",
                    80: "#1E293B",
                    60: "#334155",
                },
                gray: {
                    50: "#F8FAFC",
                    100: "#E2E8F0",
                    200: "#CBD5F5",
                },
                error: "#F87171",
                success: "#22C55E",
            },
            fontFamily: {
                ezra: ["ChairoSans", "sans-serif"],
                "ezra-bold": ["ChairoSans", "sans-serif"],
                "ezra-semibold": ["ChairoSans", "sans-serif"],
                "ezra-light": ["ChairoSans", "sans-serif"],
                "ezra-medium": ["ChairoSans", "sans-serif"],
                nothern: ["ChairoSans", "sans-serif"],
                "nothern-italic": ["ChairoSans", "sans-serif"],
                clust: ["ChairoSans", "sans-serif"],
                chairo: ["ChairoSans", "sans-serif"],
                "chairo-italic": ["ChairoSans", "sans-serif"],
            },
        },
    },
    plugins: [],
};
