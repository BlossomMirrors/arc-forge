<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Check,
		X,
		LogOut,
		Plus,
		Trash2,
		BadgeCheck,
		FileText,
		Clock,
		Pencil,
		UserMinus
	} from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DocumentUploadButton from '$lib/components/document-upload-button.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	let dunsNumbers: Record<string, string> = $state({});
	let documents: Record<string, { url: string; filename: string }[]> = $state({});

	let renamingId: string | null = $state(null);
	let renameValue = $state('');

	function startRename(id: string, currentName: string) {
		renamingId = id;
		renameValue = currentName;
	}

	function addDocument(profileId: string, doc: { url: string; filename: string }) {
		documents[profileId] = [...(documents[profileId] ?? []), doc];
	}

	function removeDocument(profileId: string, url: string) {
		documents[profileId] = (documents[profileId] ?? []).filter((d) => d.url !== url);
	}
</script>

<svelte:head>
	<title>Developer Profile - Arc Forge</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h2 class="text-lg font-semibold">{m.devprofile_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.devprofile_hint()}</p>
	</div>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	{#if data.invitations.length > 0}
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-muted-foreground">{m.devprofile_invitations()}</h3>
			<ul class="divide-y divide-border rounded-lg border border-border">
				{#each data.invitations as invite (invite.id)}
					<li class="flex items-center justify-between px-4 py-2.5 text-sm">
						<div>
							<span class="font-medium">{invite.developerProfile.name}</span>
							<span class="ml-2 text-xs text-muted-foreground">
								{m.devprofile_invited_by()}
								{invite.inviter.name}
							</span>
						</div>
						<div class="flex items-center gap-1">
							<form method="POST" action="?/acceptInvitation" use:enhance>
								<input type="hidden" name="invitationId" value={invite.id} />
								<Button type="submit" size="sm">
									<Check class="size-4" />
									{m.devprofile_accept()}
								</Button>
							</form>
							<form method="POST" action="?/rejectInvitation" use:enhance>
								<input type="hidden" name="invitationId" value={invite.id} />
								<Button type="submit" variant="ghost" size="sm">
									<X class="size-4" />
									{m.devprofile_decline()}
								</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-muted-foreground">{m.devprofile_mine()}</h3>
		{#if data.memberships.length === 0}
			<p class="text-sm text-muted-foreground">{m.devprofile_empty()}</p>
		{:else}
			<ul class="space-y-4">
				{#each data.memberships as membership (membership.developerProfile.id)}
					{@const profile = membership.developerProfile}
					{@const canInvite = membership.role === 'owner' || membership.role === 'admin'}
					{@const isOwner = membership.role === 'owner'}
					{@const latestRequest = profile.verificationRequests[0]}
					<li class="rounded-lg border border-border p-4">
						<div class="flex items-center justify-between">
							<div>
								{#if renamingId === profile.id}
									<form
										method="POST"
										action="?/renameProfile"
										use:enhance={({ cancel }) => {
											if (
												profile.verified &&
												renameValue.trim() !== profile.name &&
												!confirm(m.devprofile_rename_verified_confirm())
											) {
												cancel();
												return;
											}
											return async ({ update }) => {
												await update();
												renamingId = null;
											};
										}}
										class="flex items-center gap-1.5"
									>
										<input type="hidden" name="developerProfileId" value={profile.id} />
										<Input name="name" bind:value={renameValue} class="h-8 w-48" required />
										<Button type="submit" size="sm" variant="ghost">
											{m.devprofile_rename_save()}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onclick={() => (renamingId = null)}
										>
											{m.form_cancel()}
										</Button>
									</form>
								{:else}
									<div class="flex items-center gap-2">
										<p class="font-medium">{profile.name}</p>
										{#if isOwner || data.isStaff}
											<button
												type="button"
												class="text-muted-foreground hover:text-foreground"
												title={m.devprofile_rename()}
												onclick={() => startRename(profile.id, profile.name)}
											>
												<Pencil class="size-3.5" />
											</button>
										{/if}
										{#if profile.verified}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600"
											>
												<BadgeCheck class="size-3" />
												{m.devprofiles_verified()}
											</span>
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<span
									class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
								>
									{membership.role}
								</span>
								<form method="POST" action="?/leave" use:enhance>
									<input type="hidden" name="developerProfileId" value={profile.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive"
										title={m.devprofile_leave()}
									>
										<LogOut class="size-4" />
									</Button>
								</form>
								{#if isOwner || data.isStaff}
									<form
										method="POST"
										action="?/deleteProfile"
										id="delete-profile-form-{profile.id}"
										use:enhance
									>
										<input type="hidden" name="developerProfileId" value={profile.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon"
											class="text-muted-foreground hover:text-destructive"
											title={m.devprofile_delete()}
											onclick={(e) => {
												e.preventDefault?.();
												e.stopPropagation?.();
												if (confirm(m.devprofile_delete_confirm({ name: profile.name }))) {
													const deleteForm = document.getElementById(
														`delete-profile-form-${profile.id}`
													) as HTMLFormElement | null;
													deleteForm?.submit();
												}
											}}
										>
											<Trash2 class="size-4" />
										</Button>
									</form>
								{/if}
							</div>
						</div>

						<div class="mt-4 space-y-1.5 border-t border-border pt-4">
							<h4 class="text-xs font-semibold text-muted-foreground">
								{m.devprofile_members()}
							</h4>
							<ul class="space-y-1">
								{#each profile.members as teamMember (teamMember.id)}
									{@const isSelf = teamMember.user.id === data.user?.id}
									<li
										class="flex items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm"
									>
										<div class="min-w-0">
											<p class="truncate">{teamMember.user.name}</p>
											<p class="truncate text-xs text-muted-foreground">
												{teamMember.user.email}
											</p>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											{#if canInvite && !isSelf}
												<form
													method="POST"
													action="?/updateMemberRole"
													use:enhance
													class="contents"
												>
													<input type="hidden" name="developerProfileId" value={profile.id} />
													<input type="hidden" name="memberId" value={teamMember.id} />
													<select
														name="role"
														value={teamMember.role}
														onchange={(e) => e.currentTarget.form?.requestSubmit()}
														class="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
													>
														<option value="member">{m.devprofile_role_member()}</option>
														<option value="admin">{m.devprofile_role_admin()}</option>
														{#if isOwner}
															<option value="owner">{m.devprofile_role_owner()}</option>
														{/if}
													</select>
												</form>
												<form method="POST" action="?/removeMember" use:enhance>
													<input type="hidden" name="developerProfileId" value={profile.id} />
													<input type="hidden" name="memberId" value={teamMember.id} />
													<button
														type="submit"
														class="text-muted-foreground hover:text-destructive"
														title={m.devprofile_remove_member()}
													>
														<UserMinus class="size-3.5" />
													</button>
												</form>
											{:else}
												<span class="text-xs text-muted-foreground">{teamMember.role}</span>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						</div>

						{#if canInvite}
							<form
								method="POST"
								action="?/invite"
								use:enhance
								class="mt-4 flex items-center gap-2 border-t border-border pt-4"
							>
								<input type="hidden" name="developerProfileId" value={profile.id} />
								<Input
									type="email"
									name="email"
									placeholder={m.devprofile_invite_email()}
									class="flex-1"
									required
								/>
								<select
									name="role"
									class="h-9 rounded-md border border-input bg-background px-2 text-sm"
								>
									<option value="member">{m.devprofile_role_member()}</option>
									<option value="admin">{m.devprofile_role_admin()}</option>
									{#if isOwner}
										<option value="owner">{m.devprofile_role_owner()}</option>
									{/if}
								</select>
								<Button type="submit" size="sm">
									<Plus class="size-4" />
									{m.devprofile_invite()}
								</Button>
							</form>
						{/if}

						{#if canInvite && profile.invitations.length > 0}
							<div class="mt-4 space-y-1.5 border-t border-border pt-4">
								{#each profile.invitations as invite (invite.id)}
									<div
										class="flex items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm"
									>
										<span class="truncate">{invite.email}</span>
										<span class="flex shrink-0 items-center gap-2">
											<span class="text-xs text-muted-foreground">{invite.role}</span>
											<span
												class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"
											>
												<Clock class="size-3" />
												{m.devprofile_invite_pending()}
											</span>
											<form method="POST" action="?/cancelInvitation" use:enhance>
												<input type="hidden" name="invitationId" value={invite.id} />
												<button
													type="submit"
													class="text-muted-foreground hover:text-destructive"
													title={m.devprofile_invite_cancel()}
												>
													<X class="size-3.5" />
												</button>
											</form>
										</span>
									</div>
								{/each}
							</div>
						{/if}

						{#if canInvite && !profile.verified}
							<div class="mt-4 border-t border-border pt-4">
								{#if latestRequest?.status === 'PENDING'}
									<p class="text-sm text-muted-foreground">
										{m.devprofile_verify_pending()}
									</p>
								{:else}
									{#if latestRequest?.status === 'REJECTED'}
										<div class="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
											<p class="text-sm font-medium text-destructive">
												{m.devprofile_verify_rejected()}
											</p>
											{#if latestRequest.reviewNote}
												<p class="text-sm text-muted-foreground">{latestRequest.reviewNote}</p>
											{/if}
										</div>
									{/if}
									<form method="POST" action="?/requestVerification" use:enhance class="space-y-2">
										<p class="text-sm font-medium">{m.devprofile_verify_heading()}</p>
										<p class="text-xs text-muted-foreground">{m.devprofile_verify_hint()}</p>
										<input type="hidden" name="developerProfileId" value={profile.id} />
										<input
											type="hidden"
											name="documentUrls"
											value={(documents[profile.id] ?? []).map((d) => d.url).join('\n')}
										/>
										<Input
											name="dunsNumber"
											placeholder={m.devprofile_verify_duns()}
											bind:value={dunsNumbers[profile.id]}
											required
										/>
										<div class="space-y-1.5">
											{#each documents[profile.id] ?? [] as doc (doc.url)}
												<div
													class="flex items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm"
												>
													<span class="flex min-w-0 items-center gap-1.5 truncate">
														<FileText class="size-3.5 shrink-0 text-muted-foreground" />
														<span class="truncate">{doc.filename}</span>
													</span>
													<button
														type="button"
														class="shrink-0 text-muted-foreground hover:text-destructive"
														onclick={() => removeDocument(profile.id, doc.url)}
													>
														<X class="size-3.5" />
													</button>
												</div>
											{/each}
											<DocumentUploadButton onuploaded={(doc) => addDocument(profile.id, doc)} />
										</div>
										<Button
											type="submit"
											size="sm"
											disabled={!(documents[profile.id] ?? []).length}
										>
											{m.devprofile_verify_submit()}
										</Button>
									</form>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="max-w-md space-y-3 border-t border-border pt-6">
		<h3 class="text-sm font-semibold text-muted-foreground">{m.devprofile_create_heading()}</h3>
		<form method="POST" action="?/create" use:enhance class="flex gap-2">
			<Input name="name" placeholder={m.devprofile_create_name()} class="flex-1" required />
			<Button type="submit">{m.devprofile_create()}</Button>
		</form>
	</div>
</div>
