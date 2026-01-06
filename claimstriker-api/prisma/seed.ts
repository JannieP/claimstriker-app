import { PrismaClient, Role, Permission } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Permission matrix for seeding.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: [],
  ADMIN: [
    Permission.VIEW_USERS,
    Permission.EDIT_USERS,
    Permission.VIEW_CHANNELS,
    Permission.MANAGE_CHANNELS,
    Permission.VIEW_SYSTEM,
  ],
  SUPER_ADMIN: Object.values(Permission),
};

async function main() {
  console.log('Seeding role permissions...');

  // Clear existing permissions
  await prisma.rolePermission.deleteMany();

  // Seed role permissions
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: {
          role: role as Role,
          permission: permission,
        },
      });
    }
  }

  console.log('Role permissions seeded successfully!');

  // Check if we need to create super admin
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superAdminEmail) {
    const user = await prisma.user.findUnique({
      where: { email: superAdminEmail },
    });

    if (user && user.role !== Role.SUPER_ADMIN) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: Role.SUPER_ADMIN },
      });
      console.log(`Promoted ${superAdminEmail} to SUPER_ADMIN`);
    }
  }

  // If no users exist and we're creating the first one, make them super admin
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('No users exist yet. First registered user will be SUPER_ADMIN.');
  } else {
    // Check if any super admin exists
    const superAdminCount = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN },
    });

    if (superAdminCount === 0) {
      // Promote the first user to super admin
      const firstUser = await prisma.user.findFirst({
        orderBy: { createdAt: 'asc' },
      });

      if (firstUser) {
        await prisma.user.update({
          where: { id: firstUser.id },
          data: { role: Role.SUPER_ADMIN },
        });
        console.log(`Promoted first user (${firstUser.email}) to SUPER_ADMIN`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
