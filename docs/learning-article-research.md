# Explanation design review — 2026-09-09

Six primary-author articles were read for design patterns, not as evidence that
a particular UI guarantees learning outcomes. Adapt the teaching technique,
not their prose, diagrams or assets.

| Reference | Observed technique | Application here |
| --- | --- | --- |
| [Red Blob Games: A*](https://www.redblobgames.com/pathfinding/a-star/introduction.html) | Keep one map while adding cost and heuristics; compare failure cases. | Keep the same notes app and vary one condition. |
| [Bartosz Ciechanowski: GPS](https://ciechanow.ski/gps/) | The limit of a simpler distance model motivates the next concept. | Show why deleting a cookie does not invalidate a server session before teaching revocation. |
| [Josh W. Comeau: Flexbox](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/) | Return to the opening practical example after explaining the model. | Finish with a question that applies the same mechanism to leaked IDs. |
| [Julia Evans: dig](https://jvns.ca/blog/2021/12/04/how-to-use-dig/) | Focus on a few useful inputs and the relevant parts of real output. | Show the Cookie header and the server decision, not an exhaustive option list. |
| [Stripe: Idempotency](https://stripe.com/blog/idempotency) | Separate failure locations and reconsider the same case with a remedy. | Distinguish browser state, server state, and the next request. |
| [MDN: HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies) | Connect Set-Cookie to the next Cookie request with concrete values. | Join the manipulated scene to the article's HTTP example. |

## Applied corrections and authoring rules

- Put the server-side-session / same-profile assumptions before the answer.
- Make every action expose what changed, what did not, and why.
- Show concrete request/response observations and keep deeper implementation
  optional; preserve the complete article rather than reducing it to trivia.
- Do not conflate identifying a session with authorization to read a note.
- Reject an invalidated ID even while the browser still sends it. Issuing a new
  session must not be depicted as reviving the same old ID.
- In the OIDC call flow, receive the token response before validating the ID
  token. See [OIDC Core code-flow steps](https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowSteps).
- Session renewal assumptions follow [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renew-the-session-id-after-any-privilege-level-change).

The full-body correction and prepared activities are applied only to the
owner-selected private session article. Future authors receive the same
guidance through the save_study_article MCP description/schema.
