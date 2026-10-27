import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly supabase = inject(Supabase).client;
  private readonly router = inject(Router);

  readonly session = signal<Session | null>(null);
  /** Passe à true une fois la session initiale lue (évite un aller-retour vers /connexion au chargement). */
  readonly ready = signal(false);

  readonly user = computed(() => this.session()?.user ?? null);
  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return '';
    const name = (u.user_metadata?.['display_name'] as string | undefined)?.trim();
    return name || (u.email ?? '').split('@')[0];
  });
  readonly initial = computed(() => this.displayName().charAt(0).toUpperCase());

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      this.ready.set(true);
      if (event === 'PASSWORD_RECOVERY') this.router.navigateByUrl('/nouveau-mot-de-passe');
    });
  }

  /** Résout dès que la session initiale est connue. */
  async whenReady(): Promise<void> {
    if (this.ready()) return;
    const { data } = await this.supabase.auth.getSession();
    this.session.set(data.session);
    this.ready.set(true);
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(email: string, password: string, displayName: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    /** false : l'utilisateur doit confirmer son adresse avant de se connecter. */
    return { signedIn: !!data.session };
  }

  async sendPasswordReset(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  }

  async updatePassword(password: string) {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async signOut() {
    await this.supabase.auth.signOut();
    await this.router.navigateByUrl('/connexion');
  }
}
