# Article-grounded conversation and enjoyable learning

## Shipped in this change

The AI handoff includes the original article ID, selected section ID (when a real
section is selected), source URL, and displayed update time. It tells the connected
client to call `search_learning({id: "article:<id>"})` on Personal Memory before
answering, then cite the returned article/section IDs and update time or body hash.
The copied text is explicitly an excerpt, not the whole article. A web login wall
is not treated as failure of authenticated MCP retrieval. If the tool is unavailable,
the assistant must say so and distinguish excerpt-based help from general advice.
Credentials are never copied. Existing saved excerpts can derive the article ID
from their trusted meetyudai source URL without data migration.

The new **Explore a why** mode asks for a concrete, source-grounded puzzle with a
short satisfying explanation, then connects it to the proper name and real system.
Prediction and experimentation are optional. The owner can go deeper, request a
different example, or stop. Copying the prompt still does not run an AI, save a note,
or assess mastery. This is a lightweight conversational experiment, not a claim
that the product already has a complete adaptive curriculum.

## Next experience to test (not implemented here)

The owner's goal is to want to learn, not accumulate compulsory assignments.
Prior context favors visual explanations, familiar interests and useful foundations;
it also rejects a five-minute limit when it removes the bridge to a real system.

1. Show a few concrete questions from existing, relevant material, with permission
   to choose another topic or leave. Keep daily engineering articles distinct from
   the cross-domain library.
2. Start with one example/diagram and an immediate payoff, not a long prerequisite
   form or mandatory test. Expand to code, data and real system design on demand.
3. Offer a small optional prediction/experiment with feedback on the reasoning.
4. Let explicit reactions distinguish interesting, difficult, too niche and not
   relevant now. Reuse existing feedback for topic choice rather than infer dislike
   or ignorance from an unopened article.
5. Save useful explanations and original diagrams as references. Record understanding
   only on explicit self-assessment; do not turn every saved note into review debt.

Example: “Why doesn't adding more API requests make this job finish faster?” →
producer/consumer queue diagram → optional change of input rate → backpressure →
Node writable streams and bounded API concurrency. The concept's mechanics must
remain accurate; analogies are entry points, not substitutes for the real system.

Evaluate through the owner's voluntary report: “Was it interesting? Did this help?
Would you choose a related question?” Time on site and streaks are not mastery or
proof of enjoyment. No new tracking, notifications, paid model calls, or automatic
daily topic-selection changes are introduced by this patch.
