<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();

	const HIGHLIGHT = [35, 25, 15, 5, 0];
	const DARK = [42, 50, 58, 66, 72];

	const BLOCKS = [0, 0.2, 0.4, 0.6, 0.8].map((offset, i) => ({
		mainDelayMs: -(offset * 6000),
		// bob phase = (offset * 12) mod 1, expressed as a delay into the 500ms loop
		bobDelayMs: -(((offset * 12) % 1) * 500),
		highlight: HIGHLIGHT[i],
		dark: DARK[i]
	}));
</script>

<div class="conveyor {className}" aria-hidden="true">
	{#each BLOCKS as block, i (i)}
		<div class="x-mover" style="animation-delay: {block.mainDelayMs}ms">
			<div class="y-mover" style="animation-delay: {block.bobDelayMs}ms">
				<div
					class="spinner"
					style="animation-delay: {block.mainDelayMs}ms; --hl: {block.highlight}%; --dk: {block.dark}%"
				>
					<div class="sheen"></div>
				</div>
			</div>
		</div>
	{/each}
	<div class="fade fade-left"></div>
	<div class="fade fade-right"></div>
</div>

<style>
	.conveyor {
		position: relative;
		width: 240px;
		height: 64px;
		overflow: hidden;
		border-radius: 0.75rem;
	}

	.x-mover {
		position: absolute;
		top: 19px;
		left: 0;
		animation: conveyor-x 6s linear infinite;
	}

	.y-mover {
		animation: conveyor-bob 0.5s linear infinite;
	}

	.spinner {
		width: 26px;
		height: 26px;
		border-radius: 9px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, white var(--hl), var(--primary)),
			color-mix(in srgb, black var(--dk), var(--primary))
		);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 22%, transparent);
		animation: conveyor-spin 6s linear infinite;
	}

	.sheen {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(135deg, rgb(255 255 255 / 20%), transparent 58%);
	}

	.fade {
		position: absolute;
		top: 0;
		width: 44px;
		height: 100%;
		pointer-events: none;
	}

	.fade-left {
		left: 0;
		background: linear-gradient(to right, var(--background), transparent);
	}

	.fade-right {
		right: 0;
		background: linear-gradient(to left, var(--background), transparent);
	}

	@keyframes conveyor-x {
		from {
			transform: translateX(-50px);
		}
		to {
			transform: translateX(290px);
		}
	}

	@keyframes conveyor-bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-5px);
		}
	}

	@keyframes conveyor-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(1080deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.x-mover,
		.y-mover,
		.spinner {
			animation: none;
		}
	}
</style>
