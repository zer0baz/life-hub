import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './core/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (toast.message()) {
      <div role="status" class="toast">{{ toast.message() }}</div>
    }
  `,
})
export class App {
  protected readonly toast = inject(Toast);
}
