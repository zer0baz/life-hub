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
  /** Prénom tiré du profil Google, sinon début de l'adresse e-mail. */
  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return '';
    const meta = u.user_metadata ?? {};
    const name = ((meta['full_name'] ?? meta['name'] ?? '') as string).trim();
    return name.split(/\s+/)[0] || (u.email ?? '').split('@')[0];
  });
  readonly initial = computed(() => this.displayName().charAt(0).toUpperCase());
  readonly avatarUrl = computed(() => (this.user()?.user_metadata?.['avatar_url'] as string | undefined) ?? null);

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.ready.set(true);
    });
  }

  /** Résout dès que la session initiale est connue (y compris au retour de Google). */
  async whenReady(): Promise<void> {
    if (this.ready()) return;
    const { data } = await this.supabase.auth.getSession();
    this.session.set(data.session);
    this.ready.set(true);
  }

  /** Redirige vers Google ; au retour, Supabase ouvre la session et crée le compte s'il n'existe pas. */
  async signInWithGoogle() {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async signOut() {
    await this.supabase.auth.signOut();
    await this.router.navigateByUrl('/connexion');
  }
}
