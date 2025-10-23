execute if predicate nice_mob_variants:percentages/60 run return run tag @s add nice_mob_variants.companions.done

tag @s add nice_mob_variants.companions.done

$execute as @n[type=minecraft:trader_llama,distance=..8] if data entity @s leash{UUID:$(UUID)} at @s run function nice_mob_variants:kill
$execute as @n[type=minecraft:trader_llama,distance=..8] if data entity @s leash{UUID:$(UUID)} at @s run function nice_mob_variants:kill

execute if predicate nice_mob_variants:percentages/50 run return run function nice_mob_variants:wandering/pig with entity @s
function nice_mob_variants:wandering/cow with entity @s