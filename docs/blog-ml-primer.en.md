# A Primer on Machine Learning, Neural Networks, and PyTorch — Background Reading for the Homemade Shogi AI Article

> The companion article "[My Blog's Shogi AI Was Embarrassingly Weak, So I Had a Fleet of AI Agents Rebuild It in a Day](./blog-shogi-ai-rebuild.en.md)" throws around machine-learning vocabulary — NNUE, distillation, backpropagation, quantization — with no explanation. This piece builds up, from zero, the background you need to read that main article without getting stuck on the words. The intended reader: **completely new to machine learning / can play shogi at roughly amateur 2-dan / can read a bit of code**. I keep the math to a minimum and explain with analogies and real Python you can copy-paste and run. Every technical term is unpacked the first time it appears. And every example is tied to the homemade shogi AI in the main article (`DistillNet`, the evaluation function, YaneuraOu, NNUE).

---

## 0. Map of this article

We build up the knowledge you need, from the bottom.

1. **What is machine learning** — the shift from "humans write the rules" to "learn the rules from data"
2. **What is a neural network** — a box that implements "intuition" out of multiplications and additions
3. **How does it learn** — loss, gradient descent, backpropagation. "Descending a foggy mountain blindfolded"
4. **What is PyTorch** — the Python toolkit for building and training neural nets, with a minimal copy-paste example
5. **CPU vs. GPU** — why training is GPU work, but search and NNUE evaluation are CPU work
6. **What is distillation** — moving knowledge from a strong-but-slow teacher to a small-but-fast student
7. **Glossary** — a quick reference for the terms in the main article

In a hurry? Chapter 5 (CPU/GPU) and Chapter 7 (glossary) alone will answer the main article's "why can't we just use the GPU" and "what even is NNUE." But read chapters 1–4 in order and you'll understand *why* the main article's metaphors — "the evaluation function is a judge," "learning is descending a mountain" — are the metaphors they are.

---

## 1. What is machine learning

### 1.1 Two ways to program

When you want a computer to "judge" something, there are broadly two approaches.

**Approach A: a human writes all the rules.** This is ordinary programming. A human puts "if X then Y" into words and lines them up. The **handwritten evaluation function** in the main article is exactly this. The implementation there is a sum of human-readable rules:

```text
score  = material;          // pawn = 100, rook = 1040 ... summed difference
score += piece-square bonus; // a table: "this piece on this square is worth +N"
score += king safety count;  // number of gold/silver around the king
score += castle shape;       // pattern-match yagura / mino / anaguma
score += bo-gin pressure;    // "if the silver climbs the 2nd file, penalize the defender"
return score;               // e.g. +250 (Sente is 2.5 pawns better)
```

Line by line, a human writes down what they **know**: "a thick king defense is good," "a broken castle is bad." The upside is that when it's wrong, you can fix it — in the main article, a bug where "the bo-gin pressure term cut off at board rank dan4" gets fixed pinpoint. The downside: you can only encode **knowledge a human can put into words**. Turning a 2-dan player's vague "somehow Sente looks better here" into explicit rules is, in practice, impossible.

**Approach B: instead of writing the rules, write the mechanism that learns them.** This is machine learning. The human writes no "if the king is thin, −N" rule at all. Instead, you **show it a huge pile of "a million positions plus their correct scores" and let it find the rules itself**. The human only writes the procedure for "how to hunt for rules while correcting mistakes"; the rules themselves get filled in by the machine.

This contrast is the heart of machine learning. As a slogan:

> **Instead of writing the rules, write the mechanism that learns the rules.**

### 1.2 A concrete shogi example

Let's build the same job — "look at a board, return a number" — two ways.

- **Handwritten version** (Approach A): a human fills in a table — "number of gold/silver defending the king × 30," "+800 if the rook has promoted," and so on. Seven months of writing, per the main article.
- **Machine-learned version** (Approach B): have **YaneuraOu** (a superhuman shogi engine) score a million positions to make "problem + answer" pairs, then let the machine hunt for rules from those. The human never writes the concept "king safety."

The surprising part: crack open the machine-learned version and all you find is **about 590,000 nameless numbers**. There is no row labeled "king safety." And yet, trained well, it scores positions more accurately than the handwritten version. In the main article this machine-learned version (the NNUE) ultimately **beats the handwritten version 77.1% in self-play**.

"If you can't read what's inside, how can it produce correct answers?" — the theme the main article keeps returning to — has a familiar explanation: **a dan-level player's board sense**. A 2-dan player glances at a position and *feels* "Sente is better," but cannot fully verbalize the judgment. They can rationalize after the fact ("more material"), but the actual computation in their head is invisible even to them. And yet the judgment is right. Machine learning implements exactly this "intuition that bypasses language" as a lump of numbers.

---

## 2. What is a neural network

Among the "rule-hunting machines" of machine learning, there are several kinds. The one used in shogi AI (and most of modern AI) is the **neural network**. The name comes from the brain's neurons, but the contents have nothing to do with biology — think of it as **nothing but a chain of multiplications and additions**.

### 2.1 Neurons, layers, weights

What the smallest unit — a "neuron" — does is simple. **Take several input numbers, multiply each by a "weight," and add them all up.** That's it.

```text
output = input1 × weight1 + input2 × weight2 + ... + inputN × weightN + bias
```

These "weights" are exactly what machine learning adjusts. Think **weights = a large bank of adjustable dials**. Turn a dial and you change "how much this neuron cares about which input." The shogi network in the main article (`DistillNet`) has **about 590,000** of these dials. Learning is the act of turning those 590,000 dials, a little at a time, so the output gets closer to correct.

Line neurons up side by side and you get a **layer**; stack layers and you get a network. Data flows **input layer → hidden layer → output layer**, repeating multiply-and-add. A "hidden layer" is a middle layer that is neither input nor output (hidden because you don't see it directly from outside).

### 2.2 DistillNet as the concrete example

Look at the shape of `DistillNet`, the network actually trained in the main article, and everything gets concrete:

```text
input: 2268 board features + hand (captured piece) info
  ↓ layer 1 (256 neurons)     ← the biggest; this roughly determines speed
  ↓ layer 2 (32 neurons)      ← squeezed to 1/8 at once (an NNUE-family trait)
  ↓ layer 3 (1 neuron)        ← finally emits "one evaluation number"
output: one number (e.g. cp / 600, later converted back to a score like "+250")
```

- The **2268 inputs** are **facts** about the board laid out one by one — "there's a Sente pawn on 7f," "there's a Sente king on 5i" — each 1 if it holds, 0 if not. These are called **features**.
- The numbers narrow **256 → 32 → 1**. The first layer condenses every fact about the board into 256 numbers, the next compresses that into 32, and the last collapses it into a single "how many points is this position" number.
- Most of the dials (weights) live in the input layer: **2268 × 256 ≈ 580,000**. Nothing here is written as "king safety" or "bo-gin." They are just nameless numbers.

### 2.3 Activation functions — why "just multiply and add" isn't enough

Here's a counterintuitive fact. **No matter how many layers of pure multiply-and-add you stack, you get no more expressive power than a single layer.** Mathematically, any number of linear transforms (multiply-then-add) collapses into a single linear transform. That makes deep stacking pointless.

So after each layer we insert an **activation function** — a "non-straight" tweak, applied once. Only with this does the network gain "non-linearity" — the ability to represent curved, complex patterns. Judgments like "fire strongly only when both A and B hold," impossible with multiply-and-add alone, become possible.

The activation function shogi NNUE uses is a simple one: **ClippedReLU**. All it does is **clip anything below 0 up to 0, and anything above 1 down to 1**. In PyTorch it's one line: `torch.clamp(x, 0.0, 1.0)`.

```text
input −3  → output 0    (below 0 → 0)
input 0.4 → output 0.4  (between 0 and 1 → unchanged)
input 2.5 → output 1    (above 1 → 1)
```

Why clip the top to 1, rather than use plain ReLU (which only floors at 0, with no ceiling)? Because of a property the main article cares about a lot: it's **quantization-friendly**. Training happens in decimals (floats), but for a light, fast browser deployment we convert the weights and intermediate values to **integers (int16)**. This conversion is called quantization. If values ran unbounded, cramming them into integers would overflow, or big values would eat the precision. If the range is pinned to 0–1, it survives integerization intact. When the main article says "ClippedReLU isn't a matter of taste but of utility — because the range is fixed to 0–1, after training you can quantize floats to int16 and run on WASM integer arithmetic without precision collapse," this is what it means.

### 2.4 Implementing "unverbalizable intuition" as numbers

To sum up, a neural network is a machine that:

- takes inputs (2268 board facts),
- runs them through many rounds of "multiply, add, clip,"
- and emits one number (the evaluation).

Its 590,000 internal dials have no names and don't map to human concepts like "king safety." And yet, like a dan-level player's board sense, it can **hold whole patterns that can't be put into words, as a lump of numbers**. Where the handwritten evaluation can only hold "knowledge a human managed to verbalize," the neural net **absorbs patterns directly from a million of YaneuraOu's judgments**. That's why it can surpass the handwritten version.

---

## 3. How does it learn (training)

I said "turn 590,000 dials toward correct," but how, concretely? This is the beating heart of machine learning. We build it up in order: how to measure the mistake → how to find the direction to fix it → the practicalities of turning the dials.

### 3.1 The loss function — collapsing "how wrong" into one number

To start learning, you first need a ruler for "how wrong are we right now." That's the **loss function** (loss). It collapses the gap between the network's answer and the correct answer into a single number. **Smaller loss = closer to correct.** The whole goal of learning is "make the loss as small as possible."

The most basic loss is **MSE (Mean Squared Error)**. Just "square the gaps and average them." In shogi terms:

```text
For some position:
  YaneuraOu (teacher) correct answer = +300
  net (student) answer               = +120
  gap                                = 180
  gap squared                        = 180 × 180 = 32400
Compute this for thousands of positions and average → MSE.
```

Why square? (1) Positive and negative gaps both become positive when squared, so they don't cancel out. (2) Bigger gaps are punished more heavily, so the training comes to dislike "occasionally missing by a mile." In PyTorch it's one line: `F.mse_loss(prediction, target)`.

### 3.2 Gradient descent — descending a foggy mountain blindfolded

Now we can measure loss, the "size of the mistake." Next: "which way do we turn the dials to shrink it?" Here the metaphor the main article also uses earns its keep.

> Learning is **a person descending a foggy mountain blindfolded**.

Think of the mountain's height as the loss. You want to reach the valley floor (minimum loss = closest to correct). But the fog is thick and no one can see the whole map (the correct set of dials). **All you can feel is the slope under your feet.** Probe the ground with your foot and you can tell "this way is downhill." So take a **small step** in the steepest downhill direction. Feel the slope again, step again. Repeat forever and eventually you reach the valley.

That "slope under your feet" is, in math terms, the **gradient**. Precisely, it's a number for "if I nudge this dial up a hair, does the loss rise or fall, and how steeply?" There is one slope per dial. 590,000 dials means 590,000 slopes (gradients). Nudging the dials, a little at a time, in the direction of the gradient is called **gradient descent**. One dial update is essentially this one line:

```text
new weight = current weight − learning rate × slope (gradient)
```

"Move by the learning rate, in the direction of the slope." It's minus because you go downhill (a positive slope points uphill, so moving the other way descends).

### 3.3 Backpropagation — all the slopes from one backward pass

The catch is: how do you find that slope (gradient)? Naively, you'd "nudge one dial a hair, re-measure the loss," and repeat it **590,000 times** — 590,000 re-evaluations of the net. Utterly impractical.

**Backpropagation** (backprop) solves this in one shot. The core idea:

> **Take the "blame" that shows up at the output and distribute it backward, from output toward input. In a single backward pass, you get the slope for every dial at once.**

Pictured on the shogi net:

```text
output error "the evaluation came out 0.3 too low"
  ↓ to layer-3 weights   "because the final judgment underweighted this feature"
  ↓ to layer-2 weights   "that feature came out weak because of this compression"
  ↓ to the board input table "the number in the '7f pawn' row was too small to begin with"
```

You take one error — "the eval was too low" — and pass the blame from the back layers to the front: "what fraction of this error is your fault?" Mathematically it's just a mechanical application of the chain rule (differentiation of composed functions), but intuitively, "passing blame from output to input, layer by layer" is enough. This produces all 590,000 slopes in one pass. **Then the one line from 3.2 turns every dial at once.**

Strictly, each slope is estimated on a slice of the data (the "batch" of the next section), so it's slightly off from the true slope. This "mountain descent that wobbles a little each step" is called **SGD (Stochastic Gradient Descent)**. It wobbles, but over many steps it descends in the right direction on average.

### 3.4 Epoch, batch, learning rate — the practicalities

Three words for actually running the descent, defined with the main article's real numbers.

- **Batch**: the chunk of positions processed at once. Using all a million positions every time you compute the 590,000 slopes is too heavy, so you bundle, say, **256 positions**, measure the slope on those, and take one step. That 256 is the "batch size." Processing one batch = one step of the descent. The main article uses **batch 256**.
- **Epoch**: **using up all your data once** counts as one epoch. Running a million positions in batches of 256 is about 3,900 batches (= 3,900 steps) per epoch. One epoch isn't enough, so you loop over the same data many times. The main article does **40 epochs** — 40 passes over the same million positions.
- **Learning rate (lr)**: the "step size" in the 3.2 line. Too big and you overshoot the valley and diverge; too small and you never converge. The main article **starts at 1e-3 (= 0.001) with cosine decay** — big strides early, gradually shrinking the step later (getting cautious near the valley floor). "Cosine decay" means shrinking the step smoothly toward 0 along a cosine curve.

To feel the numbers: a million positions × 40 epochs ÷ batch 256 ≈ **about 150,000 steps** of descent. This finishes in minutes on a Mac GPU. Much lighter than the "machine learning = a giant thing that runs for days" image.

### 3.5 Overfitting and holdout — catching "memorization"

Learning has a pitfall: **overfitting**. It's when the net, rather than "learning patterns," **memorizes the answers to the problems it was shown**. A student who memorized aces the practice set but can't solve anything unseen.

The standard way to catch this is a **holdout**. You split off some data, use part of it **not at all during training**, and reserve it purely for grading. In the main article, "the last 4,000 rows are split off as a holdout." Mid-training you score these unseen 4,000 positions and watch the error there (called `val_mae` and so on; "val" = validation). **If the error on training data keeps dropping while the error on unseen data stops dropping — or starts rising — that's the sign memorization has begun.**

In the shogi context this lesson runs deeper. The main article's biggest regret: "**we measured with self-play win rate, but against a human it was weak**." Passing the holdout error (closeness to the teacher) does *not* guarantee "it won't play nonsense in production." So the main article ultimately swaps its verification ruler from "closeness to the teacher" to "**blunder rate on real human game records**." **No matter how well you pass a proxy metric, in the end you must measure the actual production behavior** — one of the heaviest lessons in this article, and one that generalizes across all of machine learning.

---

## 4. What is PyTorch, and how do you use it

Implementing all of the above — loss → gradient → backprop → descent — by hand is painful. Backprop especially (applying the chain rule across every layer) is error-prone and miserable to hand-write. The tool that **does all of it automatically** is **PyTorch**. It's a Python library from Facebook (now Meta) for building and training neural nets, and the main article's training code (`ml/train.py`) is written in it.

### 4.1 The four things PyTorch gives you

1. **Tensor**: a multi-dimensional array of numbers (vectors, matrices, and stacks thereof). Similar to a NumPy array, but with the decisive difference that it **remembers what computations were applied to it**. This is the foundation for autograd below.
2. **autograd (automatic differentiation)**: backprop, automated. As you stack computations on tensors, PyTorch records the history (the computation graph) behind the scenes. Call `loss.backward()` once and it traces that history backward to **compute the gradient for every dial automatically**. It means you never hand-write Section 3.3.
3. **Optimizer**: the part that executes "new weight = current weight − learning rate × slope" from 3.2. One line, `optimizer.step()`, updates every dial at once. The **AdamW** the main article uses is a smarter, standard-issue version of plain gradient descent (it auto-tunes the step size per dial).
4. **GPU support**: one phrase, `.to(device)`, moves the computation from CPU to GPU. The same code runs on either (details in Chapter 5).

### 4.2 A minimal, copy-paste-runnable example

Code beats words. Let's build the simplest example: "learn the relationship `y = 2x + 1` from data alone, without being told the answer." The human never writes "slope 2, intercept 1" — the net finds it from data. This is **real Python you can paste and run** (each line commented).

```python
import torch                     # PyTorch itself
import torch.nn as nn            # neural-net parts (layers, losses, ...)

# --- 1. Make dummy data (true relation is y = 2x + 1, but we don't tell the net) ---
x = torch.randn(200, 1)          # 200 random inputs (shape: a 200-row × 1-col tensor)
y = 2 * x + 1                    # the correct answer (we want it to discover this "2" and "1")

# --- 2. Define the network (input 1 → output 1, a single layer) ---
model = nn.Linear(1, 1)          # nn.Linear(in_dim, out_dim); holds one weight and one bias
                                 # = exactly 2 dials to adjust. The smallest possible neural net.

# --- 3. Set up the loss function and optimizer ---
loss_fn = nn.MSELoss()                                   # the MSE from 3.1
optimizer = torch.optim.SGD(model.parameters(), lr=0.1)  # gradient descent from 3.2; step lr=0.1

# --- 4. Run the training loop (the mountain descent) ---
for epoch in range(200):         # descend the mountain for 200 steps
    pred = model(x)              # (1) predict with the current dials (forward pass)
    loss = loss_fn(pred, y)      # (2) collapse the gap vs. the answer into one number (loss)

    optimizer.zero_grad()        # (3) clear last step's gradients (else they accumulate)
    loss.backward()              # (4) backprop: auto-compute every dial's slope (autograd's power)
    optimizer.step()             # (5) move every dial one step in the slope's direction

    if epoch % 40 == 0:                                  # print progress occasionally
        print(f"epoch {epoch:3d}  loss={loss.item():.4f}")

# --- 5. Check the result (should be close to 2 and 1) ---
w = model.weight.item()          # the learned slope (correct answer: 2.0)
b = model.bias.item()            # the learned intercept (correct answer: 1.0)
print(f"learned: y = {w:.3f} x + {b:.3f}   (truth is y = 2x + 1)")
```

Run it and the loss races toward 0, ending with something like `y = 1.998 x + 1.001` — essentially `2x + 1`. **The human never wrote "2" or "1."** Show the data, measure the mistake (loss), find the slope (backward), take a step (step) — this loop alone let the net find the relationship by itself. This is the skeleton of all machine learning.

The thing to memorize is this **five-line pattern**. No matter how large the network, the heart of the training loop always has this same shape:

```python
pred = model(x)              # forward: predict
loss = loss_fn(pred, y)      # measure the gap
optimizer.zero_grad()        # clear last step's gradients
loss.backward()              # backward: compute gradients
optimizer.step()             # take one step
```

### 4.3 A little bigger — regression with a 3-layer MLP

For those who want more than a single layer, here's a **multi-layer perceptron (MLP)** with a hidden layer. Let's build the same "input → hidden → output" structure as DistillNet, at minimal size. Note that the way the net is defined (subclassing `nn.Module`) is identical to the main article's DistillNet.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F   # "function-style" parts like clamp and relu

# --- Define the network as a class (PyTorch's standard style) ---
class SmallMLP(nn.Module):        # subclassing nn.Module is the convention
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(1, 16)   # input 1 → hidden 16
        self.fc2 = nn.Linear(16, 16)  # hidden 16 → hidden 16
        self.fc3 = nn.Linear(16, 1)   # hidden 16 → output 1

    def forward(self, x):             # write the route the data flows (defines the forward pass)
        x = torch.clamp(self.fc1(x), 0.0, 1.0)  # layer 1 → ClippedReLU (clip to 0–1)
        x = torch.clamp(self.fc2(x), 0.0, 1.0)  # layer 2 → ClippedReLU
        return self.fc3(x)                       # layer 3 → straight out (no activation)

# --- The training pattern is EXACTLY the same as 4.2 ---
model = SmallMLP()
x = torch.randn(500, 1)
y = torch.sin(x)                                        # this time learn sin(x) (a curve)
loss_fn = nn.MSELoss()
optimizer = torch.optim.AdamW(model.parameters(), lr=0.01)  # AdamW, same as the main article

for epoch in range(2000):
    pred = model(x)
    loss = loss_fn(pred, y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

print(f"final loss = {loss.item():.5f}")  # sin, a curve, is approximable thanks to the hidden layers
```

`y = sin(x)` is a curve, so as explained in 2.3 a single "multiply and add" layer can't represent it. But a 3-layer net with `torch.clamp` (ClippedReLU) injecting non-linearity approximates it fine. The 2.3 point that **activation functions enable non-linearity** now bites as running code.

### 4.4 Installing and running on a Mac

- Installation is basically the one line `pip install torch` (follow the official site's guidance for some environments).
- To run on a Mac, **specify `device = "mps"` to use the Apple Silicon (M1/M2/M3/M4) GPU**. MPS stands for Metal Performance Shaders, the gateway for driving Apple's GPU from PyTorch.

```python
# Use the GPU on a Mac (Apple Silicon)
device = "mps" if torch.backends.mps.is_available() else "cpu"  # Apple GPU if mps exists
model = model.to(device)         # move the net's dials to GPU memory
x = x.to(device)                 # data goes to the GPU too (must sit on the same device)
y = y.to(device)
# the rest of the training loop is exactly as in 4.2. You just add .to(device).
```

When the main article says "training on the Mac GPU (MPS) takes 2–4 minutes for 300k positions," this `device = "mps"` is what it means. It runs on CPU too, but putting it on the GPU makes it orders of magnitude faster (why, next chapter).

### 4.5 DistillNet — "it's the same pattern as the minimal example"

With these patterns in your head, the real `DistillNet` from the main article isn't scary anymore. You'll see its skeleton is **completely identical to `SmallMLP` from 4.3**:

```python
class DistillNet(nn.Module):
    H1 = 256   # width of layer 1 (the 16 from 4.3, now 256)
    H2 = 32    # width of layer 2

    def __init__(self):
        super().__init__()
        # (1) Board input layer. A giant table assigning a 256-dim weight to each of 2268 facts
        #     like "Sente pawn on 7f." EmbeddingBag(mode="sum") pulls the rows for the facts that
        #     hold and sums them, in one shot.
        self.board = nn.EmbeddingBag(BOARD_FEATS + 1, self.H1, mode="sum", padding_idx=PAD_IDX)
        # (2) Hand input layer. Counts of the 14 captured-piece types → the same 256 dims
        #     (this is exactly the nn.Linear we saw in 4.2)
        self.hand  = nn.Linear(HAND_FEATS, self.H1)
        # (3)(4) Compression layers. 256 → 32 → 1. Same role as SmallMLP's fc2, fc3
        self.l2    = nn.Linear(self.H1, self.H2)
        self.l3    = nn.Linear(self.H2, 1)

    def forward(self, board_idx, hands):
        a1 = self.board(board_idx) + self.hand(hands)  # sum the board and hand contributions
        h1 = torch.clamp(a1, 0.0, 1.0)          # ClippedReLU (same activation as SmallMLP)
        h2 = torch.clamp(self.l2(h1), 0.0, 1.0) # ClippedReLU
        return self.l3(h2).squeeze(-1)          # one output (no activation) ≈ cp / 600
```

The only new part is **`nn.EmbeddingBag`**. It efficiently does "of the 2268 board facts, pull the weight vectors for the ones that hold and sum them." A shogi position is a set of "where pieces are," so mathematically this is the same as multiplying a 0/1 vector through `nn.Linear(2268, 256)` — but picking up only the facts that hold and summing is vastly faster, so a dedicated part is used. Everything else — `nn.Linear`, `torch.clamp`, the way `forward` is written, subclassing `nn.Module` — is exactly the minimal examples from 4.2–4.3.

The training loop, too, is the same pattern:

```python
out  = model(board_idx, hands)                  # (1) forward: score a minibatch of positions
loss = F.mse_loss(torch.sigmoid(out), target)   # (2) measure the gap (sigmoid explained below)
optimizer.zero_grad()                           # (3) clear last step's gradients
loss.backward()                                 # (4) backprop (autograd)
optimizer.step()                                # (5) one step with AdamW
```

The one new face is `torch.sigmoid(out)`. **sigmoid** is an S-curve that squashes any number into 0–1. Rather than learn shogi evaluations directly (which span a wide range, −2000 to +2000), it's more stable to convert them into a "win-rate-ish 0–1 value" first, so we insert it. No need to go deep here, but **it's this sigmoid that causes a major incident in Cycle 3 of the main article**, so it's worth remembering the name. sigmoid has the property that as the input grows, the output sticks to 1 and stops moving (it "saturates"), and in the main article that became the chief culprit behind "nonsense moves" — "at a decided position all 71 moves look like the same score." Don't confuse it with Chapter 2's ClippedReLU (ClippedReLU is an activation function; sigmoid is an output transform applied before computing the loss).

---

## 5. CPU vs. GPU (the question asked most in the main article)

The main article keeps returning to "why can't we speed up teacher-data generation with the GPU" and "why is NNUE evaluation done on the CPU." Understand this and the whole shogi pipeline design clicks into place. The core is a single fact: **CPU and GPU have opposite strengths.**

### 5.1 What GPUs are good at — applying the same computation to a mass of data at once

A **GPU (Graphics Processing Unit)** was originally a graphics chip, specialized for "**applying the same simple computation to a huge amount of data all at once**." It has thousands of small compute cores lined up, all executing the same instruction on different data simultaneously (a mechanism that "processes multiple data with one instruction" is called SIMD, and a GPU is that scaled up thousands of times; see also the glossary in Chapter 7).

Neural network **training** is exactly this. "Push 256 positions through layer 1" is, in substance, a giant **matrix multiplication**, with tens of thousands of independent multiplications and additions. Since you process millions of positions in bulk, it's the GPU's home turf. So:

> **Training is GPU work.** On a Mac, putting it on MPS (Apple GPU) is orders of magnitude faster than CPU.

### 5.2 What CPUs are good at — sequential, branch-heavy work

A **CPU (Central Processing Unit)** uses a few powerful cores to rip through "**sequential work where what comes next depends on the situation**." It excels at unpredictable jobs where "if A then B, else C" branches chain endlessly.

Shogi **search** (reading the game tree with alpha-beta) is exactly this. "If I play this move, how does the opponent respond? Does that look good? If not, prune that branch" — an **unpredictable chain of branches where you don't know which branch to cut until you've read ahead**. You can't have "everyone runs the same instruction" the way a GPU does; each branch needs entirely different work. So:

> **Game-tree search (alpha-beta) is CPU work.** The main article's teacher-data generation is "self-play + YaneuraOu scoring," and both run on the CPU for this reason.

The main article answers the natural question "can't we just use the GPU to speed it up?" — running `ps` (a command to see process load) shows the bottleneck is the side that **generates** positions (self-play; sequential CPU search), which has nothing to do with the GPU. Adding a GPU whiffs when the bottleneck is elsewhere.

### 5.3 NNUE evaluation "looks like GPU work but is actually CPU work"

This is the most interesting — and most misunderstood — part. NNUE evaluation (board → number) is, inside, a small matrix product. "A matrix product? Surely GPU!" is the natural thought. **But in reality it runs on the CPU.** The reason lies in *how it's called*.

During search, the evaluation function is called **hundreds of thousands of times a second, sequentially**. "Evaluate this position → next branch → evaluate again → ..." — the queries arrive one at a time, in order. Not millions of positions in one bulk shot, but one at a time as the search proceeds.

Here the GPU's weakness shows. The GPU shines at "a mass of data all at once," but **each time you hand a single computation to the GPU, there's a communication cost of shipping data CPU→GPU and receiving the result back**. That round-trip cost is **larger** than the compute of one small NNUE matrix product. So:

> If you evaluate **one at a time** during search, the cost of shipping to the GPU exceeds the computation itself. So **NNUE evaluation is faster run on the CPU.**

The very fact that NNUE has an "Efficiently Updatable" design philosophy, built to run fast on CPU + SIMD, is the result of optimizing for exactly this "called sequentially during search" usage. In the main article, writing NNUE inference in WASM (a fast binary that runs in the browser) + SIMD, all the way to int16 quantization, is a chain of tricks **to run it as fast as possible on the CPU**.

### 5.4 Right tool for the right job in the shogi pipeline (summary table)

Applying all this to the shogi project: **within a single project, CPU and GPU are used per role.**

| Stage | Contents | Which fits | Why |
|---|---|---|---|
| Teacher-data generation (self-play) | chain of game-tree search | **CPU** | branch-heavy sequential work; GPU is bad at it |
| Teacher scoring (YaneuraOu) | NNUE eval, many times, sequentially | **CPU** | called one at a time; GPU round-trip is a loss |
| NNUE training (PyTorch) | matrix products over masses of positions, in bulk | **GPU (MPS)** | the GPU's home turf |
| Production play (browser) | search + NNUE eval | **CPU (WASM+SIMD)** | both search and eval are sequential; no role for the GPU |

"Generation = CPU, training = GPU" — that one line runs through the entire pipeline of the main article.

---

## 6. What is distillation — tying it all together

With these parts in place, you can grasp the backbone of the main article: **distillation**. Distillation is the technique of **moving the knowledge of a strong-but-slow "teacher" into a small-but-fast "student."** It's also called the "teacher-student" relationship.

The cast in shogi:

- **Teacher = YaneuraOu.** A superhuman shogi engine, but slow — reading a position deeply takes time. Too heavy to run in a browser.
- **Student = the homemade NNUE.** A small net of about 590,000 parameters. One evaluation finishes in microseconds (fast). Runs breezily in a browser.

The steps of distillation are exactly the previous chapters, chained:

1. **Have the teacher label the answers.** Have YaneuraOu score a million positions, producing correct labels of "this position is N cp" (cp = centipawn, an evaluation unit where one pawn ≈ 100). As per Chapter 5, this runs sequentially on the CPU. This becomes the "correct" data of Chapter 3.
2. **Have the student imitate.** Show those million problems to the student (NNUE), turn the gap from the teacher's scores into loss (Chapter 3), and descend the mountain with backprop (Chapter 3) — training in PyTorch (Chapter 4), on the GPU/MPS (Chapter 5).
3. **Quantize and ship.** Quantize the learned weights to int16 (unbroken thanks to Chapter 2's ClippedReLU) and load them into the production browser via WASM + SIMD (Chapter 5).

**Why do all this?** In a word, because **the production constraint is "run light and fast in a browser."** Running YaneuraOu itself in the browser would be strongest, but it's too heavy to run comfortably in a visitor's environment. So you extract just "YaneuraOu's judgments (a million correct answers)" and port them into a small net that runs in the browser. The student can't become as smart as the teacher, but it can **reproduce a large chunk of the teacher's knowledge in an orders-of-magnitude lighter body**. That's the aim of distillation.

The whole story of the main article — "have the teacher (YaneuraOu) score a million positions → train the student (NNUE) to imitate → quantize and ship → beat the handwritten eval 77.1%" — is the record of filling in this Chapter 6 distillation flow with real data and real measurements.

---

## 7. Glossary (quick reference)

The terms from the main article, in one or two lines each. Read top to bottom and it roughly follows the dependency order.

| Term | Meaning (1–2 lines) |
|---|---|
| **feature** | A "fact" fed as input to the net. In shogi, things like "there's a Sente pawn on 7f" — 2268 kinds. Holds = 1, not = 0 |
| **weight** | A "dial" adjusted inside the net; the number used in multiplication. About 590,000 in the shogi net |
| **tensor** | A multi-dimensional array of numbers; PyTorch's basic data type. Remembers what computations were applied to it |
| **autograd** | PyTorch's automatic differentiation. `loss.backward()` auto-computes every weight's gradient, so you never hand-write backprop |
| **loss** | A single number for "how wrong." Smaller = closer to correct. Learning is the act of minimizing it |
| **MSE** | Mean squared error. A loss that squares the gaps and averages them. `F.mse_loss` |
| **MAE / cp** | MAE = mean absolute error (average of the absolute gaps). cp = centipawn, an eval unit where one pawn ≈ 100. The student's MAE from the teacher is about 450cp in the main article |
| **gradient** | The slope of "how does the loss change if I nudge this weight up?" One per weight. The "slope under your feet" in the descent |
| **gradient descent** | Nudging weights against the gradient, a little at a time, to shrink loss. "new weight = current weight − learning rate × gradient" |
| **backpropagation (backprop)** | Distributing the output error backward to the input side, getting every weight's gradient in a single backward pass |
| **learning rate (lr)** | The step size of the descent. Too big = diverge, too small = never converge. The main article starts at 1e-3 with cosine decay |
| **batch** | A chunk of positions processed together. 256 in the main article. Processing one batch = one descent step |
| **epoch** | One pass using up all the data. 40 epochs in the main article (40 passes over a million positions) |
| **overfitting** | Memorizing the answers to the problems instead of learning patterns. Only revealed on unseen data |
| **holdout** | Data reserved purely for grading, never used in training. Used to detect overfitting. The last 4,000 positions in the main article |
| **activation function** | The non-linear tweak inserted after each layer. Without it, any number of layers has only one layer's expressive power |
| **ClippedReLU** | An activation that "clips below 0 to 0, above 1 to 1." `torch.clamp(x,0,1)`. Range 0–1, so quantization-friendly |
| **sigmoid** | An S-curve that squashes anything into 0–1. Used as a pre-loss output transform. Its saturation (sticking at 1) is the chief culprit in the main article's Cycle 3 incident |
| **inference** | Actually producing answers with a trained net. This is what runs during play (training happens once, in advance) |
| **quantization** | Converting floats (decimals) to int16 (integers) to run light and fast. Precision is preserved thanks to ClippedReLU |
| **MPS** | Metal Performance Shaders. The gateway to using Apple's GPU from PyTorch. `device = "mps"` |
| **SIMD** | A mechanism to process multiple data with one instruction. Speeds up NNUE eval on CPU. 6.2x eval speedup in the main article |
| **NNUE** | Efficiently Updatable Neural Network. A shogi-born small eval net that can be updated efficiently by increments. Runs fast on CPU + SIMD |
| **distillation** | Moving the knowledge of a strong-but-slow teacher (YaneuraOu) into a small-but-fast student (NNUE). The backbone of the main article |
| **evaluation function** | Looks at one board and returns one number. Does NOT decide "how good a move is" (that's search's job). It's the judge |
| **search** | Playing several moves ahead, asking the evaluation function for scores, and picking the best move. The tour guide that ferries the evaluation function around |

---

## 8. On to the main article

That's the background you need to read the companion article "[My Blog's Shogi AI Was Embarrassingly Weak, So I Had a Fleet of AI Agents Rebuild It in a Day](./blog-shogi-ai-rebuild.en.md)" without getting stuck on the words. The main article mobilizes all the parts we've built up here — loss, gradient, backprop, PyTorch, the CPU/GPU split, NNUE, distillation, quantization — amid **real bug hunts and measurements with no numbers omitted**. "The evaluation function is the judge, search is the tour guide," "learning is descending a foggy mountain blindfolded," "measure in real games what self-play can't" — after this article, the main article's metaphors and lessons should land, including *why* each metaphor is the metaphor it is.

Now, on to the main article.
