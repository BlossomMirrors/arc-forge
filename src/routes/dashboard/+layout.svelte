<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import {
		LogOut,
		LayoutDashboard,
		List,
		AppWindow,
		Layers,
		ShieldCheck,
		Building2,
		Check,
		Package,
		KeyRound,
		BadgeCheck
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import NotificationCenter from '$lib/components/notification-center.svelte';

	let { data, children } = $props();

	const user = $derived(data.user);
	let switching = $state(false);

	function signOut() {
		window.location.href = '/auth/logout';
	}

	async function switchDeveloperProfile(developerProfileId: string) {
		if (switching || developerProfileId === data.activeDeveloperProfileId) return;
		switching = true;
		try {
			await fetch('/api/switch-developer-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ developerProfileId })
			});
			await invalidateAll();
		} finally {
			switching = false;
		}
	}

	const navItems = $derived(
		[
			{ href: '/dashboard', label: m.nav_overview(), icon: LayoutDashboard, show: true },
			{ href: '/dashboard/whitelist', label: m.nav_whitelist(), icon: List, show: data.isStaff },
			{ href: '/dashboard/pwas', label: m.nav_pwas(), icon: AppWindow, show: true },
			{ href: '/dashboard/flatpaks', label: m.nav_flatpaks(), icon: Package, show: true },
			{
				href: '/dashboard/developer-profile',
				label: m.nav_developer_profile(),
				icon: Building2,
				show: true
			},
			{
				href: '/dashboard/review',
				label: m.nav_review(),
				icon: ShieldCheck,
				show: data.isReviewer
			},
			{
				href: '/dashboard/verified-developers',
				label: m.nav_developer_profiles(),
				icon: BadgeCheck,
				show: data.isReviewer
			},
			{
				href: '/dashboard/frontpage',
				label: m.nav_frontpage(),
				icon: Layers,
				show: data.isStaff
			},
			{
				href: '/dashboard/infra-settings',
				label: m.nav_infra_settings(),
				icon: KeyRound,
				show: data.isAdmin
			}
		].filter((item) => item.show)
	);
</script>

<div class="flex min-h-screen flex-col">
	<!-- Top header -->
	<header class="border-b border-border bg-background px-6 py-3">
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between">
			<span class="flex items-center gap-2 align-middle">
				<img src="/arc.png" alt="Arc Forge" class="size-8" />
				<span class="font-semibold">Arc Forge</span>
			</span>

			<div class="flex items-center gap-2">
				<NotificationCenter notifications={data.notifications} unreadCount={data.unreadCount} />

				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 ring-2 ring-transparent transition hover:ring-primary/40 focus-visible:ring-primary/40 focus-visible:outline-none"
					>
						<img src={data.avatarUrl} alt={user.name} class="size-full object-cover" />
					</DropdownMenu.Trigger>

					<DropdownMenu.Content
						class="z-50 min-w-48 rounded-lg border border-border bg-background p-1 shadow-lg"
						align="end"
						sideOffset={8}
					>
						<div class="px-3 py-2">
							<p class="text-sm font-medium">{user.name}</p>
							<p class="text-xs text-muted-foreground">{user.email}</p>
						</div>

						{#if data.developerProfiles.length > 0}
							<DropdownMenu.Separator class="my-1 h-px bg-border" />
							<p class="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground">
								{m.nav_developer_profile_switcher()}
							</p>
							{#each data.developerProfiles as profile (profile.id)}
								{@const active = profile.id === data.activeDeveloperProfileId}
								<DropdownMenu.Item
									class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
									closeOnSelect={false}
									onSelect={() => switchDeveloperProfile(profile.id)}
								>
									{#if profile.logo}
										<img
											src={profile.logo}
											alt=""
											class="size-5 shrink-0 rounded-full object-cover"
										/>
									{:else}
										<span
											class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
										>
											<Building2 class="size-3" />
										</span>
									{/if}
									<span class="flex-1 truncate">{profile.name}</span>
									{#if active}
										<Check class="size-4 shrink-0 text-primary" />
									{/if}
								</DropdownMenu.Item>
							{/each}
						{/if}

						<DropdownMenu.Separator class="my-1 h-px bg-border" />
						<DropdownMenu.Item
							class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none"
							onSelect={signOut}
						>
							<LogOut class="size-4" />
							{m.sign_out()}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</header>

	<div class="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
		<!-- Sidebar -->
		<nav class="w-52 shrink-0">
			<ul class="space-y-1">
				{#each navItems as item (item.href)}
					{@const active =
						page.url.pathname === item.href ||
						(item.href !== '/dashboard' && page.url.pathname.startsWith(item.href))}
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={item.href}
							class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors {active
								? 'bg-primary/10 font-medium text-primary'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						>
							<item.icon class="size-4 shrink-0" />
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<!-- Page content -->
		<main class="min-w-0 flex-1">
			{@render children()}
		</main>
	</div>
</div>
