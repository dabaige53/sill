export const detailNavigationMotion: Record<string, any> = {
	/** Parent is already restored before this call; only the entering/leaving top layer moves. */
	navigateDetail(dialog: HTMLElement, captured: any, returning: boolean, leavingId?: string) {
		this.cancelPanel(dialog);
		if (!captured || this.keyboard) return;
		const { face, scrolls } = captured;
		const transition = returning ? { id: leavingId, face } : null;
		if (transition) this.detailTransitions.set(dialog, transition);
		const nodes = [...dialog.children] as HTMLElement[];
		const styles = nodes.map(
			(node) => [node, node.style.position, node.style.zIndex, node.style.background] as const,
		);
		// A reader's opaque page belongs to the moving content, not to the dialog behind it.
		const page = dialog.querySelector<HTMLElement>(
			":scope > .reader-scroll, :scope > .reader-layout",
		);
		if (page) page.style.background = getComputedStyle(dialog).background;
		for (const [node] of styles) {
			if (getComputedStyle(node).position === "static") node.style.position = "relative";
			node.style.zIndex = "1001";
		}
		face.style.zIndex = returning ? "1002" : "1000";
		dialog.append(face);
		for (const [node, top, left] of scrolls) {
			node.scrollTop = top;
			node.scrollLeft = left;
		}
		const phone = returning ? captured.phone : this.phoneSheet(dialog);
		const distance = this.surface(dialog).getBoundingClientRect().height;
		const travel = phone
			? `translateY(${returning ? face.getBoundingClientRect().height : distance}px)`
			: "translateY(10px)";
		const targets = returning ? [face] : nodes;
		const animations = targets.map((node) =>
			this.animate(
				node,
				phone
					? [
							{
								transform: returning
									? getComputedStyle(node).transform
									: captured.resume?.transform || travel,
							},
							{ transform: returning ? travel : "translateY(0)" },
						]
					: returning
						? [
								{
									opacity: getComputedStyle(node).opacity,
									transform: getComputedStyle(node).transform,
								},
								{ opacity: phone ? 1 : 0, transform: travel },
							]
						: [
								captured.resume || { opacity: phone ? 1 : 0, transform: travel },
								{ opacity: 1, transform: "translateY(0)" },
							],
				{
					duration: this.time(phone ? "dur-sheet" : returning ? "dur-close" : "dur-open"),
					easing: this.curve(phone ? "ease-sheet" : "ease"),
				},
			),
		);
		let active = true;
		const cleanup = () => {
			if (!active) return;
			active = false;
			face.remove();
			if (this.detailTransitions.get(dialog) === transition) this.detailTransitions.delete(dialog);
			for (const [node, position, zIndex, background] of styles) {
				node.style.position = position;
				node.style.zIndex = zIndex;
				node.style.background = background;
			}
		};
		const finished = Promise.all(animations.map((animation) => animation?.finished));
		finished.then(cleanup, cleanup);
		this.panelAnimations.set(dialog, [...animations, { cancel: cleanup, complete: cleanup }]);
	},
};
