"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  type ChangePasswordInput,
  type DeleteAccountInput,
  changePasswordSchema,
  deleteAccountSchema,
} from "@/features/auth/schemas";
import { changePassword, deleteAccount, signOutEverywhere } from "@/features/auth/server/service";
import { authedAction } from "@/server/auth/action";
import { signOut } from "@/server/auth/config";

import {
  type NotificationsInput,
  type PreferencesInput,
  type ProfileInput,
  notificationsSchema,
  preferencesSchema,
  profileSchema,
} from "./schemas";
import { updateNotifications, updatePreferences, updateProfile } from "./server/service";

/**
 * Account settings. Every action is wrapped in authedAction: the user comes
 * from the verified session, never from the submitted data.
 */

const runUpdateProfile = authedAction(profileSchema, async (values, user) => {
  await updateProfile(user.id, values);
  revalidatePath("/", "layout");
});

export async function updateProfileAction(input: ProfileInput) {
  return runUpdateProfile(input);
}

const runUpdatePreferences = authedAction(preferencesSchema, async (values, user) => {
  await updatePreferences(user.id, values);
  // Every page shows amounts and dates: re-render them all with the new format.
  revalidatePath("/", "layout");
});

export async function updatePreferencesAction(input: PreferencesInput) {
  return runUpdatePreferences(input);
}

const runUpdateNotifications = authedAction(notificationsSchema, async (values, user) => {
  await updateNotifications(user.id, values);
  revalidatePath("/", "layout");
});

export async function updateNotificationsAction(input: NotificationsInput) {
  return runUpdateNotifications(input);
}

const runChangePassword = authedAction(changePasswordSchema, async (input, user) => {
  await changePassword(user.id, input.currentPassword, input.newPassword);
});

/** On success every session (including this one) is revoked; the client is sent to sign-in. */
export async function changePasswordAction(input: ChangePasswordInput) {
  const result = await runChangePassword(input);
  if (result.ok) await signOut({ redirectTo: "/sign-in?notice=password-changed" });
  return result;
}

const runSignOutEverywhere = authedAction(z.object({}), async (_input, user) => {
  await signOutEverywhere(user.id);
});

export async function signOutEverywhereAction() {
  const result = await runSignOutEverywhere({});
  if (result.ok) await signOut({ redirectTo: "/sign-in?notice=signed-out-everywhere" });
  return result;
}

const runDeleteAccount = authedAction(deleteAccountSchema, async (input, user) => {
  await deleteAccount(user.id, input.password);
});

export async function deleteAccountAction(input: DeleteAccountInput) {
  const result = await runDeleteAccount(input);
  if (result.ok) await signOut({ redirectTo: "/sign-in?notice=account-deleted" });
  return result;
}
