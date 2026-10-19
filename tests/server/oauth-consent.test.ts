import { registerReviewSecurityTests } from "./oauth-consent-review-security.ts";
import { registerSessionPolicyTests } from "./oauth-consent-session-policy.ts";

await registerReviewSecurityTests();

await registerSessionPolicyTests();
