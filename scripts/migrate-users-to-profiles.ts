import 'dotenv/config';
import { PrismaClient } from '../src/lib/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const STAFF_ROLE = 'staff';

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

const APPLY = process.argv.includes('--apply');

function uniqueNameAndSlug(
	baseName: string,
	takenNames: Set<string>,
	takenSlugs: Set<string>
): { name: string; slug: string } {
	const base = baseName.trim() || 'Unnamed developer';
	let name = base;
	let slug = slugify(base) || 'developer';
	let suffix = 2;
	while (takenNames.has(name.toLowerCase()) || takenSlugs.has(slug)) {
		name = `${base} (${suffix})`;
		slug = `${slugify(base) || 'developer'}-${suffix}`;
		suffix++;
	}
	takenNames.add(name.toLowerCase());
	takenSlugs.add(slug);
	return { name, slug };
}

async function backfillModel(
	label: 'PWA' | 'Flatpak',
	rows: { id: string; appid: string; submittedById: string | null }[],
	profileByUser: Map<string, string>,
	update: (id: string, developerProfileId: string) => Promise<unknown>
) {
	console.log(`\n${label}: ${rows.length} submission(s) with no developer profile.`);
	for (const row of rows) {
		const submitterId = row.submittedById;
		if (!submitterId) {
			console.log(`  ! ${row.appid} (${row.id}) has no submitter, leaving unassigned`);
			continue;
		}

		let targetProfileId = profileByUser.get(submitterId);
		let ambiguous = false;
		if (!targetProfileId) {
			const memberships = await db.developerProfileMember.findMany({
				where: { userId: submitterId },
				orderBy: { createdAt: 'asc' },
				take: 2
			});
			if (memberships.length === 0) {
				console.log(`  ! ${row.appid} (${row.id}): submitter has no profile, skipping`);
				continue;
			}
			targetProfileId = memberships[0].developerProfileId;
			ambiguous = memberships.length > 1;
		}

		console.log(
			`  ${row.appid} (${row.id}) -> ${targetProfileId}` +
				(ambiguous
					? '  [AMBIGUOUS: submitter belongs to multiple profiles, picked the oldest, verify and move manually if wrong]'
					: '')
		);
		if (APPLY) await update(row.id, targetProfileId);
	}
}

async function main() {
	console.log(
		APPLY
			? 'Running in APPLY mode. Changes will be committed.'
			: 'Running in DRY RUN mode. No changes will be made. Pass --apply to commit.'
	);

	const existingProfiles = await db.developerProfile.findMany({ select: { name: true, slug: true } });
	const takenNames = new Set(existingProfiles.map((p) => p.name.toLowerCase()));
	const takenSlugs = new Set(existingProfiles.map((p) => p.slug));

	const usersWithoutProfile = await db.user.findMany({
		where: { developerProfileMembers: { none: {} } },
		select: { id: true, name: true, roles: true }
	});

	console.log(`\nPass 1: ${usersWithoutProfile.length} user(s) with no developer profile.`);

	const profileByUser = new Map<string, string>();
	for (const user of usersWithoutProfile) {
		const { name, slug } = uniqueNameAndSlug(user.name, takenNames, takenSlugs);
		const staff = user.roles.includes(STAFF_ROLE);
		const profileId = crypto.randomUUID();
		const now = new Date();

		console.log(`  create "${name}" (${slug}) for user ${user.id}${staff ? ' [staff, verified]' : ''}`);

		if (APPLY) {
			await db.developerProfile.create({
				data: {
					id: profileId,
					name,
					slug,
					createdAt: now,
					verified: staff,
					verifiedAt: staff ? now : null
				}
			});
			await db.developerProfileMember.create({
				data: {
					id: crypto.randomUUID(),
					developerProfileId: profileId,
					userId: user.id,
					role: 'owner',
					createdAt: now
				}
			});
		}
		profileByUser.set(user.id, profileId);
	}

	console.log('\nPass 2: backfilling existing submissions.');

	const pwas = await db.pwaApp.findMany({
		where: { developerProfileId: null, submittedById: { not: null } },
		select: { id: true, appid: true, submittedById: true }
	});
	await backfillModel('PWA', pwas, profileByUser, (id, developerProfileId) =>
		db.pwaApp.update({ where: { id }, data: { developerProfileId } })
	);

	const flatpaks = await db.flatpakApp.findMany({
		where: { developerProfileId: null, submittedById: { not: null } },
		select: { id: true, appid: true, submittedById: true }
	});
	await backfillModel('Flatpak', flatpaks, profileByUser, (id, developerProfileId) =>
		db.flatpakApp.update({ where: { id }, data: { developerProfileId } })
	);

	console.log(APPLY ? '\nDone, changes committed.' : '\nDry run complete, nothing was written. Re-run with --apply to commit.');
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
