export const PASSWORD_MIN_LENGTH = 8;

export const isStrongPassword = (value: string) =>
    value.length >= PASSWORD_MIN_LENGTH && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

export const getPasswordRequirementState = (value: string) => ({
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
});

export const getPasswordRequirementText = (language?: string | null) =>
    String(language || "").toLowerCase().startsWith("tr")
        ? "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir sayı içermeli."
        : "Password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number.";
