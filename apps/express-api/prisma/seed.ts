import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import argon2 from "argon2";

const requiredEnvironmentVariables = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SEED_STUDENT_PASSWORD"
] as const;

function requireEnvironmentVariable(name: (typeof requiredEnvironmentVariables)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured in apps/express-api/.env`);
  }
  return value;
}

const databaseUrl = requireEnvironmentVariable("DATABASE_URL");
const supabaseUrl = requireEnvironmentVariable("SUPABASE_URL");
const supabaseSecretKey = requireEnvironmentVariable("SUPABASE_SECRET_KEY");
const studentPassword = requireEnvironmentVariable("SEED_STUDENT_PASSWORD");
const profilePhotosBucket = process.env.PROFILE_PHOTOS_BUCKET?.trim() || "profile-photos";

const seedStudents = [
  {
    universityId: "20260001",
    fullName: "Nada Alahmad",
    email: "nada.alahmad@quorum.edu",
    department: "Computer Science",
    classYear: 4,
    clubMemberships: ["Robotics Society", "ACM Chapter"]
  },
  {
    universityId: "20260002",
    fullName: "Maya Khalil",
    email: "maya.khalil@quorum.edu",
    department: "Computer Science",
    classYear: 4,
    clubMemberships: ["Robotics Society", "Student Wellness"]
  },
  {
    universityId: "20260003",
    fullName: "Omar Haddad",
    email: "omar.haddad@quorum.edu",
    department: "Computer Science",
    classYear: 4,
    clubMemberships: ["Robotics Society"]
  },
  {
    universityId: "20260004",
    fullName: "Lina Mansour",
    email: "lina.mansour@quorum.edu",
    department: "Computer Science",
    classYear: 4,
    clubMemberships: ["Debate Club"]
  },
  {
    universityId: "20260005",
    fullName: "Karim Nasser",
    email: "karim.nasser@quorum.edu",
    department: "Engineering",
    classYear: 3,
    clubMemberships: ["Robotics Society"]
  },
  {
    universityId: "20260006",
    fullName: "Salma Youssef",
    email: "salma.youssef@quorum.edu",
    department: "Business",
    classYear: 2,
    clubMemberships: ["Debate Club"]
  }
] as const;

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureProfilePhotosBucket(): Promise<void> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to list Supabase Storage buckets: ${listError.message}`);
  }

  if (buckets.some((bucket) => bucket.name === profilePhotosBucket)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(profilePhotosBucket, {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: "5MB"
  });

  if (createError) {
    throw new Error(`Unable to create ${profilePhotosBucket} bucket: ${createError.message}`);
  }
}

async function uploadStudentPhoto(universityId: string): Promise<string> {
  const photoPath = fileURLToPath(new URL("./seed-assets/20260001.jpeg", import.meta.url));
  const photo = await readFile(photoPath);
  const storagePath = `students/${universityId}/profile.jpeg`;

  const { error: uploadError } = await supabase.storage
    .from(profilePhotosBucket)
    .upload(storagePath, photo, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    throw new Error(`Unable to upload the seed profile photo: ${uploadError.message}`);
  }

  return `supabase-storage://${profilePhotosBucket}/${storagePath}`;
}

async function main(): Promise<void> {
  await ensureProfilePhotosBucket();
  const passwordHash = await argon2.hash(studentPassword, { type: argon2.argon2id });

  for (const seedStudent of seedStudents) {
    const photoUrl = await uploadStudentPhoto(seedStudent.universityId);
    await prisma.student.upsert({
      where: { universityId: seedStudent.universityId },
      update: {
        fullName: seedStudent.fullName,
        email: seedStudent.email,
        passwordHash,
        photoUrl,
        department: seedStudent.department,
        classYear: seedStudent.classYear,
        clubMemberships: [...seedStudent.clubMemberships]
      },
      create: {
        universityId: seedStudent.universityId,
        fullName: seedStudent.fullName,
        email: seedStudent.email,
        passwordHash,
        photoUrl,
        department: seedStudent.department,
        classYear: seedStudent.classYear,
        clubMemberships: [...seedStudent.clubMemberships]
      }
    });
  }

  console.log(`Development seed complete for ${seedStudents.length} students.`);
  console.log(`Test profile photos uploaded to the private ${profilePhotosBucket} bucket.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
