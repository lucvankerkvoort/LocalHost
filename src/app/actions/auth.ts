'use server'

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
});

export async function register(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");

  const validatedFields = RegisterSchema.safeParse({
    email,
    password,
    name,
  });

  if (!validatedFields.success) {
    return { error: validatedFields.error.issues[0].message };
  }

  const { email: validatedEmail, password: validatedPassword, name: validatedName } = validatedFields.data;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedEmail },
    });

    if (existingUser) {
      return { error: "Email already in use" };
    }

    const hashedPassword = await bcrypt.hash(validatedPassword, 10);

    await prisma.user.create({
      data: {
        email: validatedEmail,
        password: hashedPassword,
        name: validatedName,
        image: `https://ui-avatars.com/api/?name=${encodeURIComponent(validatedName)}&background=random`,
      },
    });

    return { success: "Account created successfully!" };
  } catch (error) {
    console.error("Registration error:", error);
    return { error: "Something went wrong. Please try again." };
  }
}
