<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import type { TourDetails } from '$lib/TourDetails';
	import { reassignTour } from '$lib/api';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from "$lib/components/ui/textarea/index.js";

	let showFailed = $state<boolean>(false);

	class Props {
		tour: TourDetails | undefined;
	}
	let { tour = $bindable() }: Props = $props();

	const getPhoneNumbers = (tour: TourDetails) => {
		let phoneArray: string = "";
		for(var eve of tour.events) {
			if(eve.phone != null)
			{
				let infoString = eve.last_name + ": " + eve.phone + "\n";
				phoneArray += infoString;
			}
		} 
		return phoneArray;
	};

	const handleConfirm = async () => {
		showFailed = false;
		if (tour) {
			let ok = await reassignTour(tour.tour_id);
			if (ok) {
				tour = undefined;
			} else {
				showFailed = true;
			}
		}
	};

	let value = $state("");
	const handleComment = async () => {

	};

	const customers = getPhoneNumbers(tour!);
</script>

<AlertDialog.Root>
	<AlertDialog.Trigger
		><Button variant="destructive">Tour redisponieren</Button></AlertDialog.Trigger
	>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Sind Sie sicher?</AlertDialog.Title>
			<AlertDialog.Description>
				Diese Fahrt wird (falls möglich) einem anderen Anbieter zugewiesen.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Abbrechen</AlertDialog.Cancel>
			<AlertDialog.Action on:click={handleConfirm}>Bestätigen</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Kommentarfeld in db schreiben --- wie? form, onclick, wo server file? -->
<AlertDialog.Root open={showFailed}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Die Tour konnte nicht redisponiert werden</AlertDialog.Title>
			<AlertDialog.Description>Bitte informieren Sie den/die Kunden.</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="whitespace-pre">
			{customers}
		</div>
		<form class="mb-6" method="POST" action="?/assign">
		 <div class="grid w-full gap-1.5">
			<Label for="message">Grund angeben:</Label>
			<Textarea bind:value={value} placeholder="Bitte schildern sie den Grund, weshalb die Tour nicht angetreten werden konnte." id="message" />
		 </div>
		 <AlertDialog.Footer>
			<AlertDialog.Action>Eintragen</AlertDialog.Action>
		 </AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
