const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const BASIC_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const hasInvalidDots = (local: string, domain: string) =>
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..");

const hasInvalidDomainLabels = (domain: string) =>
    domain.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-"));

export const isStrictValidEmail = (value: string) => {
    const email = value.trim();
    if (!email) return false;
    if (email.length > MAX_EMAIL_LENGTH) return false;
    if (/\s/.test(email)) return false;
    if (/[\u0000-\u001F\u007F]/.test(email)) return false;
    if (!BASIC_EMAIL_PATTERN.test(email)) return false;

    const [local = "", domain = ""] = email.split("@");
    if (!local || !domain) return false;
    if (local.length > MAX_LOCAL_LENGTH) return false;
    if (hasInvalidDots(local, domain)) return false;
    if (hasInvalidDomainLabels(domain)) return false;

    return true;
};
