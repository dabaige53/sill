import { Fragment } from "react";
import type { Card } from "../../../contracts/card.ts";
import { Avatar, Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { detailDate } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { DetailText } from "./markdown.tsx";
import { SourceMark } from "./source-mark.tsx";

function Reviewer({
	reviewer,
}: {
	reviewer: NonNullable<NonNullable<Card["pullRequest"]>["reviewers"]>[number];
}) {
	return (
		<span
			className="pr-reviewer"
			title={`${reviewer.login} · ${copy(`pr.decision.${reviewer.decision}`)}`}
		>
			<Avatar name={reviewer.login} size={24} />
			<small className={`pr-decision pr-decision-${reviewer.decision}`}>
				{reviewer.decision === "approved" && <Icon name="check" size={8} />}
				{reviewer.decision === "changesRequested" && "!"}
			</small>
		</span>
	);
}

export function PullRequest({
	card,
	detail = false,
	passive = false,
}: {
	card: Card;
	detail?: boolean;
	passive?: boolean;
}) {
	const pr = card.pullRequest;
	const stats = (
		<span className="pr-stats num">
			{pr?.additions !== undefined && <span className="pr-additions">+{pr.additions}</span>}
			{pr?.deletions !== undefined && <span className="pr-deletions">−{pr.deletions}</span>}
		</span>
	);
	const branch =
		pr && (pr.headBranch || pr.baseBranch) ? (
			<span
				className="pr-branches"
				title={[pr.headBranch, pr.baseBranch].filter(Boolean).join(" → ")}
			>
				{[pr.headBranch, pr.baseBranch].filter(Boolean).join(" → ")}
			</span>
		) : null;
	// The detail reads the branches as a sentence when the author is known: "<author> 想把 <head> 合并到 <base>".
	const intent =
		detail && pr?.author?.login && pr.headBranch && pr.baseBranch ? (
			<span className="pr-merge-intent">
				{copy("pr.mergeIntent")
					.split(/(\{\w+\})/)
					.filter(Boolean)
					.map((part) =>
						part === "{head}" || part === "{base}" ? (
							<code key={part} className="pr-branch">
								{part === "{head}" ? pr.headBranch : pr.baseBranch}
							</code>
						) : (
							<Fragment key={part}>{part === "{author}" ? pr.author?.login : part}</Fragment>
						),
					)}
			</span>
		) : null;
	const status = pr && (
		<span className={`pr-state pr-state-${pr.state}`}>
			{copy(pr.reviewRequested ? "pr.reviewRequested" : `pr.state.${pr.state}`)}
		</span>
	);
	return (
		<div className={detail ? "pr-detail" : "card-body"}>
			<header className={detail ? "detail-header" : "pr-card-heading"}>
				<div className="card-head">
					<SourceMark card={card} />
					<span className="card-src">
						{pr ? `${pr.repository} #${pr.number}` : "GitHub"}
						{detail && pr ? ` · ${copy("pr.observed")} ${detailDate(pr.observedAt, true)}` : ""}
					</span>
					{!detail && <span className="card-head-right">{status}</span>}
				</div>
				{detail ? (
					<>
						<h1 id="modal-title">{card.title}</h1>
						{!!Store.tags(card).length && (
							<div className="preview-tags">
								{Store.tags(card).map((tag) => (
									<span key={tag} className="chip soft">
										#{tag}
									</span>
								))}
							</div>
						)}
					</>
				) : (
					<h2 className="card-title">
						<button
							disabled={passive}
							type="button"
							className="card-title-button"
							data-action="card-open"
							data-id={card.id}
						>
							{card.title}
						</button>
					</h2>
				)}
				<div className="pr-branch-row">
					{detail && status}
					{intent || branch}
					{!detail && (
						<>
							{stats}
							{pr?.changedFiles !== undefined && (
								<small className="pr-file-count">
									{pr.changedFiles} {copy("pr.fileCount")}
								</small>
							)}
						</>
					)}
				</div>
			</header>
			{!detail && pr && (
				<div className="pr-footer">
					<div className="pr-reviewers">
						{pr.reviewers?.map((r) => (
							<Reviewer key={r.login} reviewer={r} />
						))}
						{!!pr.checks?.length && (
							<span
								className={`pr-check-count${pr.checks.every((c) => c.conclusion === "success") ? " is-success" : ""}`}
							>
								<Icon
									name={pr.checks.every((c) => c.conclusion === "success") ? "check" : "clock"}
									size={12}
								/>
								{copy("pr.checks")} {pr.checks.filter((c) => c.conclusion === "success").length}/
								{pr.checks.length}
							</span>
						)}
					</div>
					{pr.reviewRequested &&
						(card.url ? (
							<a
								className="pill pr-review"
								href={card.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								{copy("pr.review")}
							</a>
						) : (
							<button
								type="button"
								className="pill pr-review"
								disabled={passive}
								data-action="card-open"
								data-id={card.id}
							>
								{copy("pr.review")}
							</button>
						))}
				</div>
			)}
			{detail && (
				<>
					{pr && (
						<div className="detail-rows">
							{
								<details className="pr-check-details">
									<summary className="detail-row">
										<Icon name="check-circle" size={16} />
										<span>
											{copy("pr.checks")}{" "}
											{pr.checks?.filter((c) => c.conclusion === "success").length || 0}/
											{pr.checks?.length || 0}
										</span>
										<Icon name="chevron" size={14} />
									</summary>
									{pr.checks?.map((c) => (
										<div className="detail-row" key={c.name}>
											<span>
												{c.url ? (
													<a href={c.url} target="_blank" rel="noopener noreferrer">
														{c.name}
													</a>
												) : (
													c.name
												)}
											</span>
											<small>{copy(`pr.check.${c.conclusion || c.status}`)}</small>
										</div>
									))}
								</details>
							}
							<div className="detail-row">
								<Icon name="at" size={16} />
								<span>
									{pr.reviewers
										?.map((r) => `${r.login} ${copy(`pr.decision.${r.decision}`)}`)
										.join(" · ") || "—"}
								</span>
								<span className="pr-reviewer-avatars">
									{pr.reviewers?.map((r) => (
										<Reviewer key={r.login} reviewer={r} />
									))}
								</span>
							</div>
							<div className="detail-row">
								<Icon name="file" size={16} />
								{stats}
								<small>
									{pr.changedFiles ?? "—"} {copy("pr.fileCount")}
								</small>
							</div>
							{pr.comments !== undefined && (
								<div className="detail-row">
									<Icon name="message" size={16} />
									<span>
										{pr.comments} {copy("pr.comments")}
									</span>
								</div>
							)}
						</div>
					)}
					<DetailText body={card.body} />
					{!!pr?.files?.length && (
						<section className="detail-section">
							<h2>{copy("pr.files")}</h2>
							{pr.files.map((f) => (
								<div className="detail-row pr-file" key={f.path}>
									<Icon name="file" size={16} />
									<span title={f.path}>{f.path}</span>
									<small className="pr-stats num">
										{f.additions !== undefined && (
											<span className="pr-additions">+{f.additions}</span>
										)}
										{f.deletions !== undefined && (
											<span className="pr-deletions">−{f.deletions}</span>
										)}
									</small>
								</div>
							))}
						</section>
					)}
				</>
			)}
		</div>
	);
}
