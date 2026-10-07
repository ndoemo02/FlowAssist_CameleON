RCHITECTURE DIRECTION UPDATE — stop implementation before further P1.7b resync work.

Owner clarified the intended system boundary.

CameleON is an adaptive presentation consumer/renderer, comparable to a mannequin receiving finished garments. It is not responsible for turning arbitrary raw research output into renderable state.

The inference/workflow layer is responsible for research, comparison, filtering, viewpoint extraction, normalization, structuring, aggregation, pagination/chunking where necessary, and producing a presentation-ready semantic artifact.

There will also be dedicated inference applications such as:

Send to Diagram UI
Send to Screen Viewer
Send to Table/Chart UI
research / comparison / viewpoint extraction apps

CameleON should receive a bounded, structured presentation payload through a shared contract and then validate, select a supported representation, place it in workspace/focus/screen, and render it.

Do not modify code yet.

First perform a controlled responsibility-boundary reset:

Freeze the current P1.7b state and list all current rules B1–B8, A1–A5, D/H/M/N.
Classify every rule as owned by:
inference producer/app,
transport/gateway,
CameleON client.
Identify which current P1.7b rules were introduced only because CameleON was incorrectly assumed to reconstruct/arbitrarily restructure large producer state.
Do not delete those rules yet. Mark them KEEP / MOVE / REMOVE / REWRITE.
Draft a minimal CameleON Presentation Contract v1 describing the artifact delivered by inference to CameleON.
Preserve CameleON responsibilities:
validation, capabilities, supported representations, run isolation, seq/dedupe, interrupt identity, incoming limits, atomic apply, renderer fallback/report, layout and presentation.
Move upstream responsibilities:
research, data reduction, aggregation, pagination, large-data preparation, viewpoint selection, diagram/chart/table preparation, and construction of a deliverable resync/presentation payload.
Prepare a research brief with specific unanswered questions. Do not browse the entire inference catalog blindly. The brief will be distributed selectively to Perplexity, Exa, DeepSeek/detective analysis and inference catalog research.
Return with:
responsibility matrix,
proposed Presentation Contract v1,
KEEP/MOVE/REMOVE/REWRITE list for current P1.7b,
exact research questions,
files/commits that would be affected.

Do not implement the reset and do not start P1.6 until owner approves this architecture boundary.