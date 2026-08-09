# Approval Binding Contract

An approval is authoritative only when every check below passes immediately before handoff.

## Trusted request derivation

The approval request is generated from a retained `STEP_UP` decision and the envelope actually evaluated. It contains:

- request ID;
- decision ID and canonical decision digest;
- agent, action and resource;
- evaluated profile and envelope IDs;
- evidence digest;
- required capability `acr.approve_handoff`;
- authorized approver identities/capabilities;
- expiry bounded by the envelope expiry.

## Approval fields

The approval must exactly bind:

- request ID;
- approval ID;
- approver identity;
- required capability `acr.approve_handoff`;
- agent;
- action;
- resource;
- evaluated profile ID;
- evaluated envelope ID;
- decision ID and digest;
- evidence digest;
- approved status;
- expiry.

## Rejections

Handoff remains withheld for:

- missing approval;
- request redirect;
- self-approval;
- unauthorized identity or capability;
- rejected status;
- expired request or approval;
- approval outliving its request;
- any semantic binding mismatch;
- replayed approval ID;
- already-consumed request, even with another approval ID;
- authority invalid at immediate revalidation.

## Consumption

Consumption is synchronous and atomic inside the single-process reference. Both request ID and approval ID are marked consumed immediately before executor invocation. Cross-process approval coordination is not claimed.
