import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppButtonComponent } from './button.component';

describe('AppButtonComponent', () => {
  let fixture: ComponentFixture<AppButtonComponent>;
  let component: AppButtonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AppButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the button component', () => {
    expect(component).toBeTruthy();
  });

  it('should apply size classes based on size input', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    let button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-sm')).toBe(true);

    fixture.componentRef.setInput('size', 'md');
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-md')).toBe(true);

    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-lg')).toBe(true);
  });

  it('should apply variant classes based on variant input', () => {
    fixture.componentRef.setInput('variant', 'primary');
    fixture.detectChanges();
    let button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-primary')).toBe(true);

    fixture.componentRef.setInput('variant', 'danger');
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-danger')).toBe(true);

    fixture.componentRef.setInput('variant', 'outline');
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-outline')).toBe(true);
  });

  it('should emit clicked event on button click when active', () => {
    const spy = vi.fn();
    component.clicked.subscribe(spy);

    const button = fixture.nativeElement.querySelector('button');
    button.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should disable button and not emit clicked event when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const spy = vi.fn();
    component.clicked.subscribe(spy);

    const button = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);

    button.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should show loading spinner and disable button when loading', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('btn-loading')).toBe(true);
    expect(fixture.nativeElement.querySelector('.spinner')).toBeTruthy();
  });
});
