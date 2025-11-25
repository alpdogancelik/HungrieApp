/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
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
                ezra: ["Ezra-Regular", "sans-serif"],
                "ezra-bold": ["Ezra-Bold", "sans-serif"],
                "ezra-semibold": ["Ezra-SemiBold", "sans-serif"],
                "ezra-light": ["Ezra-Light", "sans-serif"],
                "ezra-medium": ["Ezra-Medium", "sans-serif"],
            },
        },
    },
    plugins: [],
};
