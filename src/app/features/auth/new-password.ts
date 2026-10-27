import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { Toast } from '../../core/toast';

/** Page atteinte depuis le lien de réinitialisation reçu par e-mail. */
@Component({
  selector: 'app-new-password',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  template: `
    <main class="auth-page">
      <div class="auth-box">
        <div class="brand"><div class="logo">MV</div><h1>Nouveau mot de passe</h1></div>
        <form class="card auth-card" (ngSubmit)="submit()">
          <div class="field">
            <label class="label" for="pwd">Nouveau mot de passe</label>
            <input id="pwd" name="pwd" class="input" type="password" autocomplete="new-password" minlength="6"
                   [(ngModel)]="password" required>
          </div>
          @if (error()) { <p role="alert" class="alert">{{ error() }}</p> }
          <button type="submit" class="btn btn-primary full" [disabled]="busy()">Enregistrer</button>
        </form>
      </div>
    </main>
  `,
})
export class NewPassword {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);

  readonly busy = signal(false);
  readonly error = signal('');
  password = '';

  async submit() {
    if (this.password.length < 6) return this.error.set('6 caractères minimum.');
    this.busy.set(true);
    try {
      await this.auth.updatePassword(this.password);
      this.toast.show('Mot de passe modifié');
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
